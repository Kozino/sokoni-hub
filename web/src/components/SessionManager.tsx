import {useEffect,useState} from 'react';
import {api,setToken} from '../lib/api';
export default function SessionManager(){
 const [rows,setRows]=useState<any[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=async()=>{try{setRows((await api.get<{sessions:any[]}>('/auth/sessions')).sessions);}catch(e){setError(e instanceof Error?e.message:'Unable to load sessions');}};
 useEffect(()=>{load();},[]);
 const revoke=async(id?:string)=>{setBusy(true);setError('');try{if(id)await api.del('/auth/sessions/'+id);else await api.post('/auth/logout-others');if(rows.some(r=>r.id===id&&r.current)){setToken(null);window.location.assign('/login');return;}await load();}catch(e){setError(e instanceof Error?e.message:'Unable to revoke session');}finally{setBusy(false);}};
 return <section className="card card-pad mt-3"><h3>Active sessions</h3><p>Sessions are identified by creation time. Signing out a session immediately revokes its access.</p>{error&&<p role="alert">{error}</p>}<button className="btn btn-outline" disabled={busy} onClick={()=>revoke()}>Sign out other sessions</button><ul>{rows.map(r=><li key={r.id} style={{margin:'14px 0'}}>{r.current?'This session':r.label} — {new Date(r.created_at).toLocaleString()} <button className="btn btn-outline btn-sm" disabled={busy} onClick={()=>revoke(r.id)}>Sign out</button></li>)}</ul></section>;
}
