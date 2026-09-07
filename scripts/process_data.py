import pandas as pd
import numpy as np
import json, os, re
from datetime import datetime

ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INPUT=os.path.join(ROOT,"input")
OUT=os.path.join(ROOT,"data.json")
FILL=os.path.join(INPUT,"Fill Rate.xlsx")
TMS=os.path.join(INPUT,"TMS OrderDetail.xlsx")

def read_excel(path):
    # Fill Rate and TMS exports currently use headers on the first visible row.
    # If the export adds title rows, change header=0 to header=2.
    return pd.read_excel(path, header=0)

fill=read_excel(FILL)
tms=read_excel(TMS)
fill.columns=[str(c).strip() for c in fill.columns]
tms.columns=[str(c).strip() for c in tms.columns]

# Fill Rate: DocNo -> Sent_To_distributor
fill["DocNo"]=fill["DocNo"].astype("string").str.strip()
fill["Sent_To_distributor"]=pd.to_datetime(fill["Sent_To_distributor"],errors="coerce")
fill=fill[["DocNo","Sent_To_distributor"]].dropna(subset=["DocNo"])
fill=fill.sort_values(["DocNo","Sent_To_distributor"]).drop_duplicates("DocNo",keep="first")

tms["OrderNumber"]=tms["OrderNumber"].astype("string").str.strip()
out=tms.merge(fill,left_on="OrderNumber",right_on="DocNo",how="left",validate="m:1")
out=out.drop(columns=["DocNo"],errors="ignore")
cols=list(out.columns); cols.remove("Sent_To_distributor"); pos=cols.index("OrderNumber")+1
cols.insert(pos,"Sent_To_distributor"); out=out[cols]

# Datatypes
for c in ["Date","Sent_To_distributor","DeliverDateTime","DeliverDate","RouteConfirmDate","PromisedDate"]:
    if c in out: out[c]=pd.to_datetime(out[c],errors="coerce")
for c in ["Assigned_Weight","TruckCapacityWeight","distance_to_dropped","time_outlet_outlet"]:
    if c in out: out[c]=pd.to_numeric(out[c],errors="coerce")

def valid_username(x):
    if pd.isna(x): return False
    s=str(x).strip()
    return bool(re.fullmatch(r"\d{10}",s) or (s.count("-")==1 and s.split("-",1)[1].isdigit()) or "dsa" in s.lower())
out["UserName_Error"]=~out["username"].map(valid_username)
out["CreatedDate_Error"]=out["Sent_To_distributor"].notna()&out["DeliverDateTime"].notna()&(out["DeliverDateTime"]<out["Sent_To_distributor"])
plan_weight=out.groupby("PlanNumber",dropna=False)["Assigned_Weight"].transform("sum")
out["Payload_Total_Weight"]=plan_weight
out["Payload_Error"]=out["TruckCapacityWeight"].notna()&(plan_weight>1.5*out["TruckCapacityWeight"])
out["DistanceTime_Error"]=out["distance_to_dropped"].notna()&out["time_outlet_outlet"].notna()&(out["distance_to_dropped"]>10)&(out["time_outlet_outlet"]<2)

send=out["Sent_To_distributor"].copy()
delivery=out["DeliverDateTime"]
nextday=send.notna()&delivery.notna()&(send.dt.hour>=17)&(delivery.dt.date>send.dt.date)
send.loc[nextday]=pd.to_datetime(delivery.loc[nextday].dt.date.astype(str)+" 00:00:00",errors="coerce")
out["SendNEW"]=send
out["Duration_Hours"]=(delivery-send).dt.total_seconds()/3600
out["KPI_24h_Pass"]=out["Sent_To_distributor"].notna()&out["DeliverDateTime"].notna()&(out["Duration_Hours"]<=24)
out["Accuracy_Result"]=out[["UserName_Error","CreatedDate_Error","Payload_Error","DistanceTime_Error"]].any(axis=1).astype(int)
out["KPI_Geo_Pass"]=(out["Accuracy_Result"]==0)&out["distance_to_dropped"].notna()&(out["distance_to_dropped"]<=200)
out["Unmatched_Sent_To_distributor"]=out["Sent_To_distributor"].isna()
out["Data_Quality_Issue"]=out["Unmatched_Sent_To_distributor"]|out["UserName_Error"]
def et(r):
    a=[]
    if r.UserName_Error:a.append("UserName")
    if r.CreatedDate_Error:a.append("CreatedDate")
    if r.Payload_Error:a.append("Payload")
    if r.DistanceTime_Error:a.append("Distance & Time")
    return ", ".join(a) if a else "Pass"
out["Error_Type"]=out.apply(et,axis=1)

out=out.replace([np.inf,-np.inf],np.nan)
for c in out.columns:
    if pd.api.types.is_datetime64_any_dtype(out[c]):
        out[c]=out[c].apply(lambda x:x.isoformat() if pd.notna(x) else None)
records=json.loads(out.to_json(orient="records",date_format="iso"))
with open(OUT,"w",encoding="utf-8") as f:
    json.dump({"generated_at":datetime.now().isoformat(timespec="seconds"),"rows":len(records),"columns":list(out.columns),"data":records},f,ensure_ascii=False,separators=(",",":"))
print("Generated",len(records),"rows")
