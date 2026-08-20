/**
 * GU-Q Catering Catalogue — autonomous publishing backend
 *
 * RECOMMENDED WORKFLOW
 * Events Google Form -> Finance-owned Apps Script trigger -> Drive -> Control Sheet
 * -> GitHub catalogue JSON commit -> GitHub Pages deployment.
 *
 * Events team needs only the Google Form URL.
 * Finance owns the Sheet, Drive folder, GitHub token and Apps Script.
 */
const TAB = {
  SUPPLIERS: 'Suppliers',
  PRICES: 'Price Register',
  CATEGORIES: 'Hotel Categories',
  UPLOADS: 'Menu Uploads',
  ACCESS: 'Access',
  CONFIG: 'Config'
};
const FORM_TITLE = 'GU-Q Catering Menu Upload';
const FORM_HOTEL = 'Hotel / Supplier';
const FORM_CATEGORY = 'Catering Category';
const FORM_FILE = 'Menu PDF';
const FORM_NEW_HOTEL = 'New supplier name (only if needed)';
const FORM_NEW_CATEGORY = 'New category name (only if needed)';
const FORM_NOTES = 'Notes (optional)';
const NEW_HOTEL = '+ New supplier';
const NEW_CATEGORY = '+ New category';

const HEADERS = {
  [TAB.SUPPLIERS]: ['supplier','tier','status','active'],
  [TAB.PRICES]: ['supplier','category','price_qar','price_note','updated_at','updated_by'],
  [TAB.CATEGORIES]: ['supplier','category','average_price_qar','menu_url','current_file_id','source_files','active','updated_at','updated_by'],
  [TAB.UPLOADS]: ['upload_id','supplier','category','file_name','drive_file_id','menu_url','is_current','uploaded_at','uploaded_by','github_sync_status','github_commit_url','notes'],
  [TAB.ACCESS]: ['email','role','active'],
  [TAB.CONFIG]: ['key','value','notes']
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Catering Catalogue')
    .addItem('1. Setup / repair system', 'setupSystem')
    .addItem('2. Create or refresh Events upload form', 'createOrRefreshEventsForm')
    .addItem('3. Install / repair Form submit trigger', 'installEventsFormTrigger')
    .addSeparator()
    .addItem('4. Set GitHub token', 'setGitHubToken')
    .addItem('5. Sync catalogue to GitHub now', 'syncCatalogueToGitHub')
    .addItem('6. Verify setup', 'verifySetup')
    .addToUi();
}

function setupSystem() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(HEADERS).forEach(name => ensureSheet_(ss, name, HEADERS[name]));
  const cfg = getConfig_();
  if (!cfg.DRIVE_ROOT_FOLDER_ID) {
    const folder = DriveApp.createFolder('GU-Q Catering Catalogue Menus');
    setConfigValue_('DRIVE_ROOT_FOLDER_ID', folder.getId(), 'Finance-owned root folder for approved menu PDFs.');
  }
  const email = (Session.getActiveUser().getEmail() || '').toLowerCase();
  if (email) ensureAccessUser_(email, 'Finance Admin');
  const defaults = {
    GITHUB_BRANCH: 'main',
    GITHUB_DATA_PATH: 'site/data/catalogue.json',
    SITE_URL: '',
    EVENTS_FORM_ID: '',
    EVENTS_UPLOAD_URL: '',
    EVENTS_FORM_EDIT_URL: '',
    FINANCE_SUPPORT_EMAIL: email,
    LAST_GITHUB_SYNC_AT: ''
  };
  const now = getConfig_();
  Object.keys(defaults).forEach(k => { if (!(k in now)) setConfigValue_(k, defaults[k], ''); });
  SpreadsheetApp.getUi().alert('Backend setup complete. Next run “Create or refresh Events upload form”.');
}

/**
 * Creates the Events form skeleton (or refreshes hotel/category choices).
 * Google Apps Script does not create the File Upload question here; Finance adds it once manually.
 */
function createOrRefreshEventsForm() {
  assertFinanceAdmin_();
  let cfg = getConfig_();
  let form;
  if (cfg.EVENTS_FORM_ID) {
    form = FormApp.openById(cfg.EVENTS_FORM_ID);
  } else {
    form = FormApp.create(FORM_TITLE)
      .setDescription('Events Team: select the hotel and catering category, upload the official PDF menu, and submit. Finance manages the backend automatically.')
      .setCollectEmail(true)
      .setConfirmationMessage('Menu received. The catalogue publishing workflow will process it automatically.');
    form.addListItem().setTitle(FORM_HOTEL).setRequired(true);
    form.addTextItem().setTitle(FORM_NEW_HOTEL).setHelpText('Only complete this when “+ New supplier” is selected.');
    form.addListItem().setTitle(FORM_CATEGORY).setRequired(true);
    form.addTextItem().setTitle(FORM_NEW_CATEGORY).setHelpText('Only complete this when “+ New category” is selected.');
    form.addParagraphTextItem().setTitle(FORM_NOTES);
    setConfigValue_('EVENTS_FORM_ID', form.getId(), 'Finance-owned Google Form used by Events to upload menus.');
  }

  updateListItem_(form, FORM_HOTEL, supplierChoices_());
  updateListItem_(form, FORM_CATEGORY, categoryChoices_());
  setConfigValue_('EVENTS_UPLOAD_URL', form.getPublishedUrl(), 'Share only this responder link with Events.');
  setConfigValue_('EVENTS_FORM_EDIT_URL', form.getEditUrl(), 'Finance-only form editing link.');

  const hasFileUpload = form.getItems().some(i => i.getType().toString() === 'FILE_UPLOAD' && i.getTitle() === FORM_FILE);
  let msg = 'Events form ready:\n' + form.getPublishedUrl();
  if (!hasFileUpload) {
    msg += '\n\nONE MANUAL STEP REQUIRED:\nOpen the Finance edit URL and add a required File upload question titled exactly “' + FORM_FILE + '”. Set it to PDF only and maximum 1 file. Then run “Install / repair Form submit trigger”.\n\nEdit URL:\n' + form.getEditUrl();
  } else {
    msg += '\n\nThe required “' + FORM_FILE + '” file-upload question is present. You can install/repair the trigger now.';
  }
  SpreadsheetApp.getUi().alert(msg);
}

function installEventsFormTrigger() {
  assertFinanceAdmin_();
  const cfg = getConfig_();
  if (!cfg.EVENTS_FORM_ID) throw new Error('Create the Events upload form first.');
  const form = FormApp.openById(cfg.EVENTS_FORM_ID);
  const hasFileUpload = form.getItems().some(i => i.getType().toString() === 'FILE_UPLOAD' && i.getTitle() === FORM_FILE);
  if (!hasFileUpload) throw new Error('Add a required File upload question titled exactly “' + FORM_FILE + '” before installing the trigger.');

  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'onEventsFormSubmit')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('onEventsFormSubmit').forForm(form).onFormSubmit().create();
  SpreadsheetApp.getUi().alert('Events form trigger installed. New form submissions will now publish automatically.');
}

/** Finance-owned installable Form trigger. */
function onEventsFormSubmit(e) {
  const response = e && e.response;
  if (!response) throw new Error('Missing Form response event.');
  const email = String(response.getRespondentEmail() || '').toLowerCase();
  const itemResponses = response.getItemResponses();
  const answers = {};
  itemResponses.forEach(ir => answers[ir.getItem().getTitle()] = ir.getResponse());
  const fileIds = itemResponses
    .filter(ir => ir.getItem().getType().toString() === 'FILE_UPLOAD')
    .map(ir => ir.getResponse())
    .reduce((a,b) => a.concat(b || []), []);

  if (!isAuthorizedUploader_(email)) {
    fileIds.forEach(id => { try { DriveApp.getFileById(id).setTrashed(true); } catch (_) {} });
    throw new Error('Rejected upload from unauthorized account: ' + (email || '[email unavailable]'));
  }

  const supplier = normalizeEntry_(answers[FORM_HOTEL] === NEW_HOTEL ? answers[FORM_NEW_HOTEL] : answers[FORM_HOTEL]);
  const category = normalizeEntry_(answers[FORM_CATEGORY] === NEW_CATEGORY ? answers[FORM_NEW_CATEGORY] : answers[FORM_CATEGORY]);
  if (!supplier || !category) throw new Error('Hotel and category are required.');
  if (!fileIds.length) throw new Error('No PDF file upload found in Form response.');

  ensureSupplierExists_(supplier);
  const cfg = getConfig_();
  if (!cfg.DRIVE_ROOT_FOLDER_ID) throw new Error('DRIVE_ROOT_FOLDER_ID is not configured.');
  const root = DriveApp.getFolderById(cfg.DRIVE_ROOT_FOLDER_ID);
  const supplierFolder = getOrCreateChildFolder_(root, supplier);
  const categoryFolder = getOrCreateChildFolder_(supplierFolder, category);

  // Form is configured for max one file; if more exist, all are archived but the first becomes current.
  const processed = fileIds.map(id => {
    const file = DriveApp.getFileById(id);
    const originalName = file.getName();
    file.moveTo(categoryFolder);
    return {id:file.getId(), name:originalName, url:file.getUrl()};
  });
  const current = processed[0];

  const previous = setCurrentCategoryMenu_(supplier, category, current.url, current.id, current.name, email);
  markPriorUploadsNotCurrent_(supplier, category);
  const rowNumber = appendUploadLog_({
    upload_id: Utilities.getUuid(), supplier, category, file_name: current.name,
    drive_file_id: current.id, menu_url: current.url, is_current: true,
    uploaded_at: new Date(), uploaded_by: email, github_sync_status: 'PENDING', github_commit_url: '',
    notes: String(answers[FORM_NOTES] || '') + (previous ? ' | Replaced current menu link' : ' | New menu/category link')
  });

  try {
    const sync = syncCatalogueToGitHub_('Events menu upload: ' + supplier + ' / ' + category);
    updateUploadSync_(rowNumber, 'SYNCED', sync.commit_url || '');
  } catch (err) {
    updateUploadSync_(rowNumber, 'FAILED — Finance action required', '');
    console.error('Menu saved, GitHub sync failed: ' + err.message);
  }
}

function syncCatalogueToGitHub() {
  assertFinanceAdmin_();
  const result = syncCatalogueToGitHub_('Finance manual catalogue sync');
  SpreadsheetApp.getUi().alert('GitHub sync completed.' + (result.commit_url ? '\n' + result.commit_url : ''));
}

function syncCatalogueToGitHub_(reason) {
  const cfg = getConfig_();
  ['GITHUB_OWNER','GITHUB_REPO','GITHUB_BRANCH','GITHUB_DATA_PATH'].forEach(k => { if (!cfg[k]) throw new Error('Missing Config value: ' + k); });
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('GitHub token is not configured. Finance must run “Set GitHub token”.');

  const payload = buildCataloguePayload_();
  const json = JSON.stringify(payload, null, 2) + '\n';
  const path = cfg.GITHUB_DATA_PATH;
  const apiPath = path.split('/').map(encodeURIComponent).join('/');
  const base = 'https://api.github.com/repos/' + encodeURIComponent(cfg.GITHUB_OWNER) + '/' + encodeURIComponent(cfg.GITHUB_REPO) + '/contents/' + apiPath;
  const headers = githubHeaders_(token);

  let sha = '';
  const existing = UrlFetchApp.fetch(base + '?ref=' + encodeURIComponent(cfg.GITHUB_BRANCH), {method:'get', headers, muteHttpExceptions:true});
  if (existing.getResponseCode() === 200) sha = JSON.parse(existing.getContentText()).sha || '';
  else if (existing.getResponseCode() !== 404) throw new Error('GitHub read failed (' + existing.getResponseCode() + '): ' + existing.getContentText().slice(0,300));

  const body = {
    message: '[catalogue] ' + (reason || 'Update catering catalogue'),
    content: Utilities.base64Encode(Utilities.newBlob(json, 'application/json').getBytes()),
    branch: cfg.GITHUB_BRANCH
  };
  if (sha) body.sha = sha;

  const response = UrlFetchApp.fetch(base, {
    method:'put', headers, contentType:'application/json', payload:JSON.stringify(body), muteHttpExceptions:true
  });
  const code = response.getResponseCode();
  if (![200,201].includes(code)) throw new Error('GitHub write failed (' + code + '): ' + response.getContentText().slice(0,500));
  const parsed = JSON.parse(response.getContentText());
  setConfigValue_('LAST_GITHUB_SYNC_AT', new Date().toISOString(), 'Last successful backend-to-GitHub catalogue data sync.');
  return {ok:true, commit_url: parsed.commit && parsed.commit.html_url ? parsed.commit.html_url : ''};
}

function setGitHubToken() {
  assertFinanceAdmin_();
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('GitHub token', 'Paste a fine-grained GitHub token with Contents: Read and write access to ONLY the catalogue repository. It will be stored in Apps Script Properties, not in this workbook.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const token = r.getResponseText().trim();
  if (!token) return ui.alert('No token saved.');
  PropertiesService.getScriptProperties().setProperty('GITHUB_TOKEN', token);
  ui.alert('GitHub token saved in Script Properties.');
}

function verifySetup() {
  assertFinanceAdmin_();
  const cfg = getConfig_(), issues=[];
  ['DRIVE_ROOT_FOLDER_ID','GITHUB_OWNER','GITHUB_REPO','GITHUB_BRANCH','GITHUB_DATA_PATH','EVENTS_FORM_ID','EVENTS_UPLOAD_URL'].forEach(k=>{if(!cfg[k])issues.push('Missing '+k)});
  if(!PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN'))issues.push('GitHub token not set');
  const uploaders=sheetObjects_(TAB.ACCESS).filter(r=>truthy_(r.active)); if(!uploaders.length)issues.push('No active uploaders in Access tab');
  if(cfg.EVENTS_FORM_ID){
    try{const form=FormApp.openById(cfg.EVENTS_FORM_ID);if(!form.getItems().some(i=>i.getType().toString()==='FILE_UPLOAD'&&i.getTitle()===FORM_FILE))issues.push('Form is missing required “'+FORM_FILE+'” File upload question');}catch(e){issues.push('Events form cannot be opened')}
  }
  const hasTrigger=ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='onEventsFormSubmit');if(!hasTrigger)issues.push('Events Form submit trigger is not installed');
  SpreadsheetApp.getUi().alert(issues.length?'Setup needs attention:\n• '+issues.join('\n• '):'Setup looks complete. Events only need the Form responder link.');
}

function buildCataloguePayload_() {
  const supplierRows=sheetObjects_(TAB.SUPPLIERS).filter(r=>truthy_(r.active));
  const supplierMap=new Map(supplierRows.map(s=>[String(s.supplier).trim(),s]));
  const catRows=sheetObjects_(TAB.CATEGORIES).filter(r=>truthy_(r.active));
  const groups=new Map();
  catRows.forEach(r=>{
    const supplier=String(r.supplier||'').trim(), category=String(r.category||'').trim(); if(!supplier||!category)return;
    if(!groups.has(supplier)){const sm=supplierMap.get(supplier)||{};groups.set(supplier,{supplier,tier:sm.tier||'',status:sm.status||'Preferred catering partner',categories:[]});}
    const avg=r.average_price_qar===''||r.average_price_qar==null?null:Number(r.average_price_qar);
    groups.get(supplier).categories.push({category,average_price_qar:Number.isFinite(avg)?avg:null,menu_url:r.menu_url||'',source_files:String(r.source_files||'').split(' | ').filter(Boolean)});
  });
  const hotels=[...groups.values()].sort((a,b)=>a.supplier.localeCompare(b.supplier));
  hotels.forEach(h=>h.categories.sort((a,b)=>categoryRank_(a.category)-categoryRank_(b.category)||a.category.localeCompare(b.category)));
  const cfg=getConfig_();
  return {generated_at:new Date().toISOString(),source:'GU-Q Catering Catalogue control sheet',settings:{events_upload_url:cfg.EVENTS_UPLOAD_URL||'',site_url:cfg.SITE_URL||'',finance_support_email:cfg.FINANCE_SUPPORT_EMAIL||''},hotels};
}

function refreshFormChoices_() {
  const cfg=getConfig_(); if(!cfg.EVENTS_FORM_ID)return;
  const form=FormApp.openById(cfg.EVENTS_FORM_ID);
  updateListItem_(form,FORM_HOTEL,supplierChoices_());
  updateListItem_(form,FORM_CATEGORY,categoryChoices_());
}
function supplierChoices_(){return [...new Set(sheetObjects_(TAB.SUPPLIERS).filter(r=>truthy_(r.active)).map(r=>String(r.supplier).trim()).filter(Boolean))].sort().concat([NEW_HOTEL]);}
function categoryChoices_(){return [...new Set(sheetObjects_(TAB.CATEGORIES).filter(r=>truthy_(r.active)).map(r=>String(r.category).trim()).filter(Boolean))].sort().concat([NEW_CATEGORY]);}
function updateListItem_(form,title,choices){let item=form.getItems(FormApp.ItemType.LIST).find(i=>i.getTitle()===title);if(!item){item=form.addListItem().setTitle(title).setRequired(true);}item.asListItem().setChoiceValues(choices);}

function isAuthorizedUploader_(email){if(!email)return false;return sheetObjects_(TAB.ACCESS).some(r=>String(r.email||'').toLowerCase()===email.toLowerCase()&&truthy_(r.active));}
function assertFinanceAdmin_(){const email=(Session.getActiveUser().getEmail()||'').toLowerCase();if(!email)throw new Error('Finance user identity could not be determined.');const row=sheetObjects_(TAB.ACCESS).find(r=>String(r.email||'').toLowerCase()===email&&truthy_(r.active));if(!row||!/finance|admin/i.test(String(row.role||'')))throw new Error('Finance Admin access is required. Add your email to the Access tab as Finance Admin.');return email;}
function ensureAccessUser_(email,role){if(!email)return;const rows=sheetObjects_(TAB.ACCESS);if(rows.some(r=>String(r.email||'').toLowerCase()===email.toLowerCase()))return;SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB.ACCESS).appendRow([email,role||'Events Uploader',true]);}
function ensureSupplierExists_(supplier){if(sheetObjects_(TAB.SUPPLIERS).some(r=>String(r.supplier).trim()===supplier))return;SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB.SUPPLIERS).appendRow([supplier,'Pending Finance review','New supplier/menu added by Events — Finance review required',true]);refreshFormChoices_();}

function setCurrentCategoryMenu_(supplier,category,url,fileId,sourceFile,email){const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB.CATEGORIES);const values=sh.getDataRange().getValues(),headers=values[0],idx=Object.fromEntries(headers.map((h,i)=>[String(h).trim(),i]));for(let r=1;r<values.length;r++){if(String(values[r][idx.supplier]).trim()===supplier&&String(values[r][idx.category]).trim()===category){const previous=String(values[r][idx.menu_url]||'');sh.getRange(r+1,idx.menu_url+1).setValue(url);sh.getRange(r+1,idx.current_file_id+1).setValue(fileId);sh.getRange(r+1,idx.source_files+1).setValue(sourceFile);sh.getRange(r+1,idx.active+1).setValue(true);sh.getRange(r+1,idx.updated_at+1).setValue(new Date());sh.getRange(r+1,idx.updated_by+1).setValue(email);return previous;}}sh.appendRow([supplier,category,'',url,fileId,sourceFile,true,new Date(),email]);const newRow=sh.getLastRow();sh.getRange(newRow,3).setFormula(averageFormulaForRow_(newRow));refreshFormChoices_();return '';}
function averageFormulaForRow_(row){return '=IFERROR(ROUND(SUMIFS(\'Price Register\'!$C:$C,\'Price Register\'!$A:$A,A'+row+',\'Price Register\'!$B:$B,B'+row+')/COUNTIFS(\'Price Register\'!$A:$A,A'+row+',\'Price Register\'!$B:$B,B'+row+'),0),\"\")';}
function markPriorUploadsNotCurrent_(supplier,category){const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB.UPLOADS);if(!sh||sh.getLastRow()<2)return;const v=sh.getDataRange().getValues(),h=v[0],ix=Object.fromEntries(h.map((x,i)=>[String(x).trim(),i]));for(let r=1;r<v.length;r++)if(String(v[r][ix.supplier]).trim()===supplier&&String(v[r][ix.category]).trim()===category&&truthy_(v[r][ix.is_current]))sh.getRange(r+1,ix.is_current+1).setValue(false);}
function appendUploadLog_(obj){const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB.UPLOADS),h=HEADERS[TAB.UPLOADS];sh.appendRow(h.map(k=>obj[k]!==undefined?obj[k]:''));return sh.getLastRow();}
function updateUploadSync_(row,status,commitUrl){const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB.UPLOADS),h=HEADERS[TAB.UPLOADS];sh.getRange(row,h.indexOf('github_sync_status')+1).setValue(status);sh.getRange(row,h.indexOf('github_commit_url')+1).setValue(commitUrl||'');}

function getConfig_(){const out={};sheetObjects_(TAB.CONFIG).forEach(r=>{if(r.key)out[String(r.key).trim()]=String(r.value??'').trim()});return out;}
function setConfigValue_(key,value,notes){const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB.CONFIG),v=sh.getDataRange().getValues();for(let r=1;r<v.length;r++)if(String(v[r][0]).trim()===key){sh.getRange(r+1,2).setValue(value);if(notes!==undefined&&notes!=='')sh.getRange(r+1,3).setValue(notes);return;}sh.appendRow([key,value,notes||'']);}
function sheetObjects_(name){const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);if(!sh||sh.getLastRow()<2)return[];const v=sh.getDataRange().getValues(),h=v[0].map(x=>String(x).trim());return v.slice(1).filter(row=>row.some(x=>String(x).trim()!=='' )).map(row=>h.reduce((o,k,i)=>(o[k]=row[i],o),{}));}
function ensureSheet_(ss,name,headers){let sh=ss.getSheetByName(name);if(!sh)sh=ss.insertSheet(name);if(sh.getLastRow()===0)sh.appendRow(headers);else{const current=sh.getRange(1,1,1,Math.max(sh.getLastColumn(),headers.length)).getValues()[0].map(String);headers.forEach((h,i)=>{if(current[i]!==h)sh.getRange(1,i+1).setValue(h)})}sh.setFrozenRows(1);return sh;}
function getOrCreateChildFolder_(parent,name){const safe=String(name).replace(/[\\/:*?"<>|]/g,' ').replace(/\s+/g,' ').trim();const it=parent.getFoldersByName(safe);return it.hasNext()?it.next():parent.createFolder(safe);}
function normalizeEntry_(v){return String(v||'').replace(/\s+/g,' ').trim();}
function truthy_(v){return v===true||String(v).toLowerCase()==='true'||String(v)==='1'||String(v).toLowerCase()==='yes';}
function categoryRank_(c){const r={'Coffee Break':10,'Breakfast':20,'Buffet':30,'Canapés':40,'Set Menu':50,'Family Style':60,'Meeting Package':70,'Beverage':80};return r[c]||999;}
function githubHeaders_(token){return {'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'GUQ-Catering-Catalogue-Apps-Script'};}
