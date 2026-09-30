import { useState } from 'react';
import { api } from '../lib/api';
export default function PrivateDocument({value}:{value:string}){
 const [url,setUrl]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 if(!value.startsWith('kyc://'))return <span role="status">Legacy document: replace with a secure upload or ask the operator to migrate it.</span>;
 return <div><button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={async()=>{
 setBusy(true);setError('');try{const r=await api.get<{url:string}>('/uploads/document?key='+encodeURIComponent(value));setUrl(r.url);}catch(e){setError(e instanceof Error?e.message:'Document unavailable');}finally{setBusy(false);}
 }}>View private document (60-second access)</button>{error&&<p role="alert">{error}</p>}{url&&<img src={url} alt="Private identity document" referrerPolicy="no-referrer" style={{maxWidth:'100%',maxHeight:400}} onError={()=>{setUrl('');setError('Access expired or document unavailable. Request access again.');}} />}</div>;
}
