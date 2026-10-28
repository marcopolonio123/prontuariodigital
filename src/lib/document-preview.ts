/** Reserve the tab during the click; navigate to S3 without a cross-origin fetch. */
export async function openPrivateDocument(endpoint:string,token:string,filename='documento') {
  const tab=window.open('about:blank','_blank');
  if(!tab)throw new Error('Permita a abertura de uma nova aba para visualizar o documento.');
  tab.opener=null;
  tab.document.title='Abrindo documento';
  tab.document.body.textContent='Carregando documento…';
  try {
    const response=await fetch(endpoint,{headers:{Accept:'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}});
    if(!response.ok)throw new Error(`Não foi possível abrir ${filename}.`);
    if((response.headers.get('content-type')??'').includes('application/json')) {
      const data=await response.json();
      const url=new URL(data.url);
      if(url.protocol!=='https:'||url.username||url.password)throw new Error('Endereço de visualização inválido.');
      if(!tab.closed)tab.location.replace(url.href);
    } else {
      // Existing database/local documents remain compatible.
      const url=URL.createObjectURL(await response.blob());
      if(!tab.closed)tab.location.replace(url);
      window.setTimeout(()=>URL.revokeObjectURL(url),60000);
    }
  } catch(error) {
    if(!tab.closed)tab.document.body.textContent=error instanceof Error?error.message:'Não foi possível abrir o documento.';
    throw error;
  }
}
