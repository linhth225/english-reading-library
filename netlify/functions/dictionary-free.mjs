import { CORE, IRREGULAR, CONTRACTIONS } from './dictionary-core.mjs';

const API = 'https://dict.minhqnd.com/api/v1/lookup';
const IPA_API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

function json(value, status=200) {
  return new Response(JSON.stringify(value), {
    status, headers: {
      'content-type':'application/json; charset=utf-8',
      'cache-control':'public, max-age=1800'
    }
  });
}
const normalized = w => w.toLowerCase().replace(/’/g,"'").trim();

// Return several plausible headwords, never blindly chop -s off names or words like news.
export function forms(word) {
  const w = normalized(word);
  if (CONTRACTIONS[w]) return [{lemma:w,form:''}];
  if (IRREGULAR[w]) {
    const [lemma,form] = IRREGULAR[w];
    return [{lemma,form}, ...(lemma===w?[]:[{lemma:w,form:''}])];
  }
  const result=[{lemma:w,form:''}];
  if (['news','bus','gas','this','his','as','is','was','us','yes','class','glass','dress','miss','address'].includes(w)) return result;
  const add=(lemma,form)=>{if(lemma.length>1 && !result.some(x=>x.lemma===lemma)) result.push({lemma,form});};
  if(w.endsWith('ies')&&w.length>4) add(w.slice(0,-3)+'y','plural / third-person');
  if(w.endsWith('ves')&&w.length>4){add(w.slice(0,-3)+'f','plural');add(w.slice(0,-3)+'fe','plural');}
  if(w.endsWith('es')&&w.length>4){add(w.slice(0,-2),'plural / third-person');add(w.slice(0,-1),'plural / third-person');}
  else if(w.endsWith('s')&&w.length>3 && !w.endsWith('ss')) add(w.slice(0,-1),'plural / third-person');
  if(w.endsWith('ing')&&w.length>5){const root=w.slice(0,-3);add(root,'-ing');add(root+'e','-ing');if(/(.)\1$/.test(root))add(root.slice(0,-1),'-ing');}
  if(w.endsWith('ied')&&w.length>4)add(w.slice(0,-3)+'y','past');
  if(w.endsWith('ed')&&w.length>4){const root=w.slice(0,-2);add(root,'past');add(root+'e','past');if(/(.)\1$/.test(root))add(root.slice(0,-1),'past');}
  return result;
}

export function parseData(data) {
  if(!data || data.exists === false || !Array.isArray(data.results)) return [];
  const outputs=[];
  for(const r of data.results.filter(x => x.lang_code==='en')) {
    for(const m of (r.meanings||[])) {
      if (m.definition_lang !== 'vi' || !m.definition) continue;
      const meaning=String(m.definition).replace(/\s+/g,' ').trim();
      if(meaning && meaning.length<350) outputs.push({vi:meaning,pos:String(m.pos||''),ipa:r.pronunciations?.find(p=>p.ipa)?.ipa||'',source:m.source||'@minhqnd'});
    }
    // Use Vietnamese translations only when there are no Vietnamese definitions.
    if(outputs.length===0)for(const t of (r.translations||[])) {
      if(t.lang_code==='vi'&&t.translation) outputs.push({vi:String(t.translation).trim(),pos:'',ipa:r.pronunciations?.find(p=>p.ipa)?.ipa||'',source:'@minhqnd'});
    }
  }
  return outputs;
}

const guessPOS=(word,context)=>{
 const tokens=context.toLowerCase().match(/[a-z]+(?:'[a-z]+)*/g)||[];
 const index=tokens.indexOf(word);
 const prev=tokens[index-1]||'';
 if(['to','can','could','will','would','should','must','may','might','do','does','did'].includes(prev))return 'verb';
 if(['a','an','the','these','those','many','some','several','two','three','my','your','their','our'].includes(prev))return 'noun';
 if(['very','really','quite','too','so'].includes(prev))return 'adjective';
 if(['he','she','it','they','we','i','you'].includes(prev))return 'verb';
 return '';
};
function describeForm(word, lemma, form, gloss, pos) {
  if(word===lemma) return {meaning:gloss, note:''};
  const nounLikely=(CORE[lemma]?.pos==='noun' && pos!=='verb');
  if(form.includes('plural') && nounLikely) {
    const special={car:'những chiếc ô tô; các xe hơi',house:'những ngôi nhà',issue:'các vấn đề',
      child:'những đứa trẻ',student:'các học sinh; sinh viên',person:'mọi người',
      story:'những câu chuyện',problem:'những vấn đề',city:'các thành phố'};
    return {meaning:special[lemma]||`(số nhiều) ${gloss}`,note:`Số nhiều của “${lemma}”.`};
  }
  if(form.includes('third-person') || (form.includes('plural') && !nounLikely)) {
    return {meaning:gloss,note:`Dạng chia của “${lemma}” (ngôi thứ ba hoặc số nhiều).`};
  }
  return {meaning:gloss,note:`Dạng biến đổi của “${lemma}” (${form}).`};
}

function derivedIPA(word,lemma,base,form){
  if(word===lemma) return base;
  const known={cars:'/kɑːrz/',houses:'/ˈhaʊzɪz/',issues:'/ˈɪʃuːz/',
    children:'/ˈtʃɪldrən/',women:'/ˈwɪmɪn/',men:'/men/',people:'/ˈpiːpəl/',
    working:'/ˈwɝːkɪŋ/',studies:'/ˈstʌdiz/'};
  if(known[word])return known[word];
  if(!base || !base.startsWith('/') || !base.endsWith('/'))return '';
  if(form.includes('plural') || form.includes('third-person')){
    const core=base.slice(1,-1);
    const suffix=/(tʃ|dʒ|ʃ|ʒ|s|z)$/.test(core)?'ɪz':/(p|t|k|f|θ)$/.test(core)?'s':'z';
    return `/${core}${suffix}/`;
  }
  return ''; // No guessing for irregular past tense or other derived forms.
}

const scoreMeaning=(m,pos)=>{
 const p=m.pos.toLowerCase();
 if(!pos)return 0;
 if(pos==='noun' && /danh|noun/.test(p))return 3;
 if(pos==='verb' && /động|verb/.test(p))return 3;
 if(pos==='adjective' && /tính|adj/.test(p))return 3;
 return 0;
};

async function fetchWithTimeout(url, timeout=4500) {
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeout);
 try{return await fetch(url,{signal:controller.signal,headers:{accept:'application/json'}});}
 finally{clearTimeout(timer);}
}
async function lookupExternal(lemma) {
 try {
   const url=`${API}?word=${encodeURIComponent(lemma)}&lang=en`;
   const response=await fetchWithTimeout(url);
   if(!response.ok)return [];
   return parseData(await response.json());
 } catch(error) {console.warn('Dictionary API unavailable:',error?.message||error);return [];}
}
async function lookupIPA(form) {
 try {
  const response=await fetchWithTimeout(IPA_API+encodeURIComponent(form),3000);
  if(!response.ok)return '';
  const data=await response.json();
  return data?.[0]?.phonetics?.find(p=>p.text)?.text || data?.[0]?.phonetic || '';
 }catch{return '';}
}

export async function resolveWord(word,context='') {
 const w=normalized(word);
 const contraction=CONTRACTIONS[w];
 if(contraction)return {word,base_form:w,meaning_vi:contraction.vi,ipa:contraction.ipa,source:'curated',note:'Dạng viết tắt'};
 const variations=forms(w);
 const pos=guessPOS(w,context);

 // If a known canonical lemma for a plural is available, prioritize it over an unrelated sense of the inflected spelling.
 const knownDerived=variations.find(f=>f.lemma!==w && CORE[f.lemma]);
 const irregular=IRREGULAR[w]?.[0];
 let chosen=CORE[w] ? variations[0] : (knownDerived || (irregular && CORE[irregular] ? variations[0] : null));
 let meanings=[];
 if(!chosen){
   for(const candidate of variations){
     const external=await lookupExternal(candidate.lemma);
     if(external.length){chosen=candidate; meanings=external;break;}
     if(CORE[candidate.lemma]){chosen=candidate;break;}
   }
 }
 if(!chosen)chosen=variations[0];
 const c=CORE[chosen.lemma];
 // Prefer curated baseline for very common words: this avoids unpredictable translation-memory results.
 if(c){
   // Context-sensitive tweaks for common polysemous words only when the cue is clear.
   let vi=c.vi;
   if(chosen.lemma==='work')vi=pos==='noun'?'công việc':pos==='verb'?'làm việc':c.vi;
   if(chosen.lemma==='like')vi=/\b(like|likes)\s+(?:a|an|the|this|that|my|your)\b/i.test(context)?'thích; giống như':c.vi;
   if(chosen.lemma==='modern' && /\bhistory\b/i.test(context)) vi='cận đại (khi nói về lịch sử)';
   if(chosen.lemma==='modern' && /\b(science|technology|building|life|world)\b/i.test(context))vi='hiện đại';
   const ipa=await lookupIPA(w) || derivedIPA(w,chosen.lemma,c.ipa,chosen.form) || (chosen.lemma===w?c.ipa:'');
   const described=describeForm(w,chosen.lemma,chosen.form,vi,pos);
   return {word,base_form:chosen.lemma,meaning_vi:described.meaning,ipa,
       note:described.note,source:'curated'};
 }
 if(!meanings.length)meanings=await lookupExternal(chosen.lemma);
 if(meanings.length){
   meanings.sort((a,b)=>scoreMeaning(b,pos)-scoreMeaning(a,pos));
   const filtered=meanings.filter(m=>scoreMeaning(m,pos)>0);
   const best=(filtered.length?filtered:meanings)[0];
   const ipa=await lookupIPA(w) || (chosen.lemma===w?best.ipa:derivedIPA(w,chosen.lemma,best.ipa,chosen.form));
   return {word,base_form:chosen.lemma,meaning_vi:best.vi,ipa,
     note:chosen.lemma!==w?`Tra theo từ gốc “${chosen.lemma}”.`: '',source:'minhqnd'};
 }
 return {word,base_form:chosen.lemma,meaning_vi:'Chưa có nghĩa tiếng Việt đáng tin cậy cho từ này.',
   ipa:await lookupIPA(w),note:'Không dùng bản dịch máy thiếu kiểm chứng.',source:'none'};
}

export default async function handler(request){
 if(request.method!=='GET')return json({error:'Method not allowed'},405);
 const url=new URL(request.url);
 const word=String(url.searchParams.get('word')||'').trim();
 const context=String(url.searchParams.get('context')||'').slice(0,700);
 if(!/^[a-zA-Z]+(?:['’][a-zA-Z]+)*$/.test(word) || word.length>60)return json({error:'Từ cần tra không hợp lệ.'},400);
 try{return json(await resolveWord(word,context));}
 catch(error){console.error('dictionary-free error',error);return json({error:'Không thể tra từ lúc này.'},502);}
}
