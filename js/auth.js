// Demo only. Production authentication will be replaced later.
const users={NPP001:{password:'demo123',npp:'NPP001'},NPP002:{password:'demo123',npp:'NPP002'}};
go.onclick=()=>{const u=document.getElementById('u').value.trim().toUpperCase(),p=document.getElementById('p').value;if(!users[u]||users[u].password!==p){msg.textContent='Invalid username or password';return}sessionStorage.tmsUser=JSON.stringify({user:u,npp:users[u].npp});location='index.html'};
