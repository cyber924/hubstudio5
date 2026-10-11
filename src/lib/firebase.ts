import {getApp,getApps,initializeApp} from 'firebase/app';
import {getAuth} from 'firebase/auth';
const app=getApps().length?getApp():initializeApp({apiKey:'AIzaSyDEpFAsf1fI65xXklKYsukAWFYw5bzaHyc',authDomain:'studio-9240700230-1dd9a.firebaseapp.com',projectId:'studio-9240700230-1dd9a'});
export const auth=getAuth(app);
export async function authFetch(url:string,options:RequestInit={}){
 const account=auth.currentUser;
 const send=async(force=false)=>{
  const headers=new Headers(options.headers);
  if(account&&url.startsWith('/api/')){headers.set('Authorization',`Bearer ${await account.getIdToken(force)}`);if(auth.currentUser?.uid!==account.uid)throw new Error('로그인 계정이 변경됐습니다. 다시 시도하세요.');}
  return fetch(url,{...options,headers});
 };
 let res=await send();if(res.status===401&&account)res=await send(true);return res;
}
