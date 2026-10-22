import {readFile, writeFile, mkdir, access} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';

// Explicit, staged campaign execution. No credential reads; authentication stays in the CLI.
// Never resubmit after an ambiguous response. Inspect the queue and receipt first.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const pack=resolve(root,'Context/marketing/holiday-drip-2026');
const run=resolve(root,'.astro/holiday-adaptlypost');
const cli=process.env.ADAPTLYPOST_CLI_PATH||resolve(process.env.APPDATA,'npm/node_modules/@adaptlypost/cli/dist/cli.js');
const profile='twisted-pin-holiday-2026';
const account={facebookConnectionId:'cmv9vrb2m006u01pbd2ynqdmy',pageId:'1482359171984495',instagramConnectionId:'cmv9vsohm006v01pbdtl3rto2',workspaceId:'cmv9vq1w4006p01pb0c0mh3fg'};
const expectedDates=['10-23T12:00:00-05:00','10-28T12:00:00-05:00','10-30T12:00:00-05:00','11-06T12:00:00-06:00','11-09T12:00:00-06:00','11-13T12:00:00-06:00','11-17T18:00:00-06:00','11-18T09:00:00-06:00','11-20T12:00:00-06:00','11-25T12:00:00-06:00','11-27T12:00:00-06:00','12-04T12:00:00-06:00','12-07T12:00:00-06:00','12-16T12:00:00-06:00','12-23T12:00:00-06:00','12-28T12:00:00-06:00'].map(s=>'2026-'+s);
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const save=async (name,j)=>{await mkdir(run,{recursive:true});await writeFile(resolve(run,name),JSON.stringify(j,null,2)+'\n');};
const exists=async p=>{try{await access(p);return true;}catch{return false;}};
function call(args){
  const raw=execFileSync(process.execPath,[cli,'--profile',profile,...args,'--json'],{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:20*1024*1024});
  const j=JSON.parse(raw); assert.equal(j.ok,true,`CLI failed: ${args.join(' ')}`);return j;
}
const manifest=await read(resolve(pack,'posting-dates/campaign-manifest.json'));
const canonical=await read(resolve(pack,'campaign.json'));
const mode=process.argv[2];
async function preflight(){
  assert.equal(manifest.posts.length,16);assert.equal(canonical.copy_revision,'series-copy-v3');
  assert.deepEqual(manifest.posts.map(p=>p.proposed_publish_at),expectedDates);
  const result=[];
  for(const p of manifest.posts){
    const c=canonical.post_copy_drafts.find(c=>c.calendar_id===p.calendar_id);
    assert.ok(c);assert.equal(p.proposed_publish_at_utc,new Date(p.proposed_publish_at).toISOString());
    assert.equal(c.proposed_publish_at,p.proposed_publish_at);assert.equal(p.timezone,'America/Chicago');
    assert.ok(Date.parse(p.proposed_publish_at)>Date.now(),`Past date: ${p.folder}`);
    const local=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(p.proposed_publish_at));
    assert.equal(local,p.proposed_publish_at.slice(0,19).replace('T',' '));
    assert.equal(p.captions.facebook,c.variants.facebook_feed.caption);
    assert.equal(p.captions.instagram_without_verified_bio,c.variants.instagram_feed.alternate_caption_without_verified_bio_link);
    const url=p.event==='nye-2026'?'https://www.twistedpin.com/new-years-eve/':'https://www.twistedpin.com/jingle-bowl/';
    assert.equal(p.url,url);assert.ok(p.captions.facebook.includes(url));assert.ok(p.captions.instagram_without_verified_bio.includes(url.replace('https://www.','')));
    for(const t of [p.captions.facebook,p.captions.instagram_without_verified_bio,p.assets.feed.alt_text])assert.ok(!/\b(?:central|CST|CDT|America\/Chicago)\b/i.test(t));
    assert.ok(p.captions.instagram_without_verified_bio.length<=2200);assert.ok(p.assets.feed.alt_text.length<=1000);
    const path=resolve(pack,'posting-dates',p.folder,p.assets.feed.filename);const b=await readFile(path);
    assert.equal(b.subarray(1,4).toString(),'PNG');assert.equal(b.readUInt32BE(16),1080);assert.equal(b.readUInt32BE(20),1350);
    assert.equal(sha(b),p.assets.feed.sha256);assert.equal(sha(await readFile(resolve(pack,p.assets.feed.source))),sha(b));
    const datePost=await read(resolve(pack,'posting-dates',p.folder,'post.json'));assert.deepEqual(datePost,p);
    result.push({calendar_id:p.calendar_id,folder:p.folder,local:p.proposed_publish_at,utc:p.proposed_publish_at_utc,path,sha256:sha(b),bytes:b.length,phase:p.phase,event_url:p.url,facebook_chars:p.captions.facebook.length,instagram_chars:p.captions.instagram_without_verified_bio.length});
  }
  assert.equal(new Set(result.map(p=>p.sha256)).size,16);
  return result;
}
const list=()=>call(['post','list','--platform','FACEBOOK','--platform','INSTAGRAM','--from','2026-10-22T00:00:00-05:00','--to','2026-12-29T23:59:59-06:00','--all']);
if(mode==='prepare'){
  const checked=await preflight();const identity=call(['whoami']);
  const accounts=call(['accounts','list']).data.filter(a=>['FACEBOOK','INSTAGRAM'].includes(a.platform));
  assert.equal(accounts.length,2);
  assert.ok(accounts.some(a=>a.platform==='FACEBOOK'&&a.id===account.facebookConnectionId&&a.pageId===account.pageId&&a.status==='active'));
  assert.ok(accounts.some(a=>a.platform==='INSTAGRAM'&&a.id===account.instagramConnectionId&&a.username==='twistedpinplainfield'&&a.status==='active'));
  const queue=list();assert.equal(queue.data.length,0,'Existing entries require reconciliation, not a new bulk submission');
  await save('queue-before.json',queue);
  await save('preflight.json',{checked_at:new Date().toISOString(),profile,account,timezone:'America/Chicago',instagram_copy:'approved_plain_address_fallback',posts:checked,existing_queue_count:queue.data.length});
  console.log(JSON.stringify({pass:true,posts:checked.length,existing_queue_count:queue.data.length,accounts:accounts.map(a=>({platform:a.platform,id:a.id,pageId:a.pageId,username:a.username,status:a.status})),identity_keys:Object.keys(identity.data)}));
}else if(mode==='upload'){
  const checked=await preflight();const uploads=await exists(resolve(run,'uploads.json'))?await read(resolve(run,'uploads.json')):[];
  for(const p of checked){
    let u=uploads.find(u=>u.calendar_id===p.calendar_id);
    if(!u){
      const data=call(['media','upload',p.path]).data;assert.equal(data.length,1);assert.equal(data[0].mimeType,'image/png');
      u={calendar_id:p.calendar_id,sha256:p.sha256,uploaded_at:new Date().toISOString(),...data[0]};uploads.push(u);await save('uploads.json',uploads);
    }
    assert.equal(u.sha256,p.sha256);
    const response=await fetch(u.publicUrl);assert.equal(response.status,200);
    assert.equal(sha(Buffer.from(await response.arrayBuffer())),p.sha256,'Uploaded image bytes differ');
    console.log(`Image verified: ${p.folder}`);
  }
  const body={platforms:['FACEBOOK','INSTAGRAM'],timezone:'America/Chicago',pageIds:[account.pageId],instagramConnectionIds:[account.instagramConnectionId],facebookConfigs:[{pageId:account.pageId,postType:'FEED',shareToStory:false}],instagramConfigs:[{connectionId:account.instagramConnectionId,postType:'FEED',shareToStory:false}],posts:manifest.posts.map(p=>({contentType:'IMAGE',text:p.captions.facebook,platformTexts:[{platform:'FACEBOOK',text:p.captions.facebook},{platform:'INSTAGRAM',text:p.captions.instagram_without_verified_bio}],mediaUrls:[uploads.find(u=>u.calendar_id===p.calendar_id).publicUrl],mediaAltTexts:[p.assets.feed.alt_text],scheduledAt:p.proposed_publish_at_utc}))};
  await save('payload.json',body);console.log('Prepared 16-item payload. Nothing scheduled by upload mode.');
}else if(mode==='validate'){
  await preflight();const validation=call(['post','bulk','--json-file',resolve(run,'payload.json'),'--dry-run']);
  await save('validation.json',validation);console.log(JSON.stringify(validation,null,2));
}else if(mode==='submit'){
  assert.equal(process.argv[3],'--authorized-by-jon','Submission requires explicit invocation after review');
  await preflight();assert.ok(!(await exists(resolve(run,'submission-started.json'))),'Submission already attempted. Reconcile, never blindly retry.');
  const v=await read(resolve(run,'validation.json'));assert.equal(v.ok,true);
  assert.equal(v.meta.dryRun,true);assert.equal(v.meta.valid,16);assert.equal(v.meta.invalid,0);assert.equal(v.data.length,16);
  for(let i=0;i<16;i++){
    const r=v.data[i].report;assert.equal(r.valid,true);assert.equal(r.outcome,'SCHEDULED');
    assert.equal(r.scheduledAt,manifest.posts[i].proposed_publish_at_utc);assert.deepEqual(r.issues,[]);
    assert.equal(r.accounts.length,2);assert.ok(r.accounts.every(a=>a.status==='READY'&&a.issues.length===0));
    assert.ok(r.accounts.some(a=>a.platform==='FACEBOOK'&&a.connectionId===account.pageId));
    assert.ok(r.accounts.some(a=>a.platform==='INSTAGRAM'&&a.connectionId===account.instagramConnectionId));
  }
  const queue=list();assert.equal(queue.data.length,0,'Queue changed; reconcile before submitting');
  await save('submission-started.json',{started_at:new Date().toISOString(),authorization:'Jon: yup go for it - just double check your work in relation to right platorm, right time, right copy, right etc',payload_sha256:sha(await readFile(resolve(run,'payload.json')))});
  const receipt=call(['post','bulk','--json-file',resolve(run,'payload.json')]);await save('submission.json',receipt);console.log(JSON.stringify(receipt,null,2));
}else if(mode==='readback'){
  const queue=list();await save('queue-after.json',queue);
  const receipt=await read(resolve(run,'submission.json'));console.log(JSON.stringify({queue_count:queue.data.length,receipt:receipt.data}));
  const results=receipt.data;assert.equal(results.length,16);assert.equal(receipt.meta.scheduled,16);assert.equal(receipt.meta.failed,0);
  for(let i=0;i<results.length;i++){
    assert.equal(results[i].success,true);assert.equal(results[i].isScheduled,true);
    const post=call(['post','get',results[i].postId]);await save(`post-${i.toString().padStart(2,'0')}.json`,post);
    console.log(JSON.stringify({index:i,id:results[i].postId,keys:Object.keys(post.data)}));
  }
}else if(mode==='verify'){
  const payload=await read(resolve(run,'payload.json')),submission=await read(resolve(run,'submission.json'));
  const queue=await read(resolve(run,'queue-after.json')),started=await read(resolve(run,'submission-started.json'));
  assert.equal(submission.meta.scheduled,16);assert.equal(submission.meta.failed,0);assert.equal(queue.data.length,16);
  assert.deepEqual(queue.data.map(p=>p.id).sort(),submission.data.map(p=>p.postId).sort());
  assert.ok(queue.data.every(p=>p.status==='SCHEDULED'));
  assert.equal(sha(await readFile(resolve(run,'payload.json'))),started.payload_sha256);
  const posts=[];
  for(let i=0;i<16;i++){
    const expected=manifest.posts[i],body=payload.posts[i],actual=(await read(resolve(run,`post-${i.toString().padStart(2,'0')}.json`))).data;
    assert.equal(actual.id,submission.data[i].postId);assert.equal(actual.status,'SCHEDULED');assert.equal(actual.contentType,'IMAGE');
    assert.equal(actual.scheduledAt,expected.proposed_publish_at_utc);assert.equal(actual.timezone,'America/Chicago');assert.equal(actual.text,expected.captions.facebook);
    assert.deepEqual(actual.mediaUrls,body.mediaUrls);assert.deepEqual(actual.mediaAltTexts,body.mediaAltTexts);assert.equal(actual.platforms.length,2);
    assert.deepEqual(actual.platforms.map(p=>p.platform).sort(),['FACEBOOK','INSTAGRAM']);
    const platforms={};
    for(const p of actual.platforms){
      assert.equal(p.status,'PENDING');assert.equal(p.text,body.platformTexts.find(t=>t.platform===p.platform).text);
      assert.deepEqual(p.mediaUrls,body.mediaUrls);assert.deepEqual(p.mediaAltTexts,body.mediaAltTexts);
      for(const key of ['publishedAt','platformPostId','errorMessage','postUrl'])assert.ok(!p[key],`${actual.id}: unexpected ${key}`);
      const postType=p.platform==='FACEBOOK'?p.facebookPostType:p.instagramPostType;assert.equal(postType,'FEED');
      if(p.platform==='FACEBOOK'){assert.equal(p.pageId,account.pageId);assert.equal(p.facebookPageExternalId,account.pageId);assert.equal(p.accountName,'Twisted Pin');}
      else{assert.equal(p.connectionId,account.instagramConnectionId);assert.equal(p.accountName,'TWISTED PIN');}
      platforms[p.platform]={id:p.id,connection_id:p.connectionId,...(p.pageId?{page_id:p.pageId}:{}),account_name:p.accountName,status:p.status,text:p.text,post_type:postType};
    }
    posts.push({calendar_id:expected.calendar_id,folder:expected.folder,post_id:actual.id,status:actual.status,created_at:actual.createdAt,scheduled_at_utc:actual.scheduledAt,scheduled_at_local:expected.proposed_publish_at,platforms,media_url:actual.mediaUrls[0],sha256:expected.assets.feed.sha256,alt_text:actual.mediaAltTexts[0],event_url:expected.url});
  }
  assert.equal(new Set(posts.flatMap(p=>Object.values(p.platforms).map(t=>t.id))).size,32);
  const receipt={schema_version:1,verified_at:new Date().toISOString(),scheduled_created_at:started.started_at,authorization:{approved_by:'Jon',approved_at:started.started_at,approved_at_basis:'Authorization recorded when the authorized submission began; not an exact chat message timestamp.',instruction:started.authorization,scope:['facebook_feed','instagram_feed'],excluded:['Stories','Google Business','SMS','email','ads','runtime changes']},profile,timezone:'America/Chicago',accounts:account,status:'scheduled',occasions:16,platform_targets:32,failed:0,published:0,duplicate_count:0,copy_revision:canonical.copy_revision,instagram_caption_variant:'instagram_without_verified_bio',payload_sha256:started.payload_sha256,verification:{source_hashes:true,uploaded_media_download_hashes:true,utc_and_local_times:true,server_validation:true,remote_captions:true,remote_media_and_alt:true,remote_accounts:true,remote_feed_types:true,queue_has_exactly_expected_ids:true,actual_meta_app_crop_preview:false},limitations:['Future platform publishing outcome is not yet known.','Account access and inventory may change before publication.','Instagram caption web addresses are plain text; no unverified bio-link claim is used.','Actual native Meta crop preview was not available; the saved feed uses the original 1080x1350 PNG without aspect transforms.'],posts};
  const durable=resolve(pack,'scheduling');await mkdir(durable,{recursive:true});
  await writeFile(resolve(durable,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  await writeFile(resolve(durable,'submitted-payload.json'),JSON.stringify(payload,null,2)+'\n');
  const validation=await read(resolve(run,'validation.json'));
  await writeFile(resolve(durable,'server-validation.json'),JSON.stringify(validation,null,2)+'\n');
  console.log(JSON.stringify({verified:true,occasions:16,platform_targets:32,scheduled:16,published:0,duplicates:0,receipt:'Context/marketing/holiday-drip-2026/scheduling/receipt.json'}));
}else throw Error('Use prepare, upload, validate, submit --authorized-by-jon, readback, or verify');
