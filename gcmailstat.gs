const GCX = Object.freeze({
  settings: 'Настройки', definitions: 'Рассылки', results: 'Статистика', journal: 'Журнал',
  propertyLogin: 'GC_LOGIN', propertyPassword: 'GC_PASSWORD',
  columns: ['Обновлено','ID рассылки','Название','Канал','Всего сообщений','Доставлено',
    'Ошибки','Запрещено','Просмотры','Открываемость','Клики','CTR (от доставленных)',
    'CTOR (от просмотров)','Доля ошибок и запретов','Отписки','Доля отписок'],
  defColumns: ['Активна','ID рассылки','Название','Канал','Ссылка (необязательно)',
    'База: всего','База: доставлено','База: ошибки','База: запрещено',
    'База: просмотры','База: клики','База: отписки','База: самостоятельные отписки']
});


function onOpen() {
  SpreadsheetApp.getUi().createMenu('Рассылки GetCourse')
    .addItem('1. Подготовить листы', 'gcSetup')
    .addItem('2. Проверить подключение', 'gcTestConnection')
    .addItem('3. Обновить статистику', 'gcSyncMailings')
    .addSeparator()
    .addItem('Включить ежедневное обновление', 'gcInstallDailyTrigger')
    .addItem('Удалить автообновление', 'gcRemoveTriggers')
    .addToUi();
}

function gcBook_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function gcSheet_(name) {
  const book = gcBook_();
  return book.getSheetByName(name) || book.insertSheet(name);
}
function gcSetup() {
  const settings = gcSheet_(GCX.settings);
  if (settings.getLastRow() === 0) {
    settings.getRange(1,1,5,2).setValues([
      ['Параметр','Значение'],
      ['Адрес школы','https://example.getcourse.ru'],
      ['Часовой пояс','Europe/Moscow'],
      ['Размер пакета запросов','20'],
      ['Описание','Укажите домен вашей школы GetCourse. Логин и пароль задайте в свойствах скрипта.']
    ]);
  }
  gcApplyHeader_(settings,2);
  const defs=gcSheet_(GCX.definitions);
  gcEnsureColumns_(defs, GCX.defColumns.length);
  defs.getRange(1,1,1,GCX.defColumns.length).setValues([GCX.defColumns]);
  gcApplyHeader_(defs,GCX.defColumns.length);
  defs.getRange('B:B').setNumberFormat('@');
  const result=gcSheet_(GCX.results);
  gcEnsureColumns_(result,GCX.columns.length);
  result.getRange(1,1,1,GCX.columns.length).setValues([GCX.columns]);
  gcApplyHeader_(result,GCX.columns.length);
  result.getRange('B:B').setNumberFormat('@');
  const journal=gcSheet_(GCX.journal);
  journal.getRange(1,1,1,4).setValues([['Время','Уровень','ID','Сообщение']]);
  gcApplyHeader_(journal,4);
  SpreadsheetApp.flush();
}
function gcEnsureColumns_(sheet,n){if(sheet.getMaxColumns()<n)sheet.insertColumnsAfter(sheet.getMaxColumns(),n-sheet.getMaxColumns());}
function gcApplyHeader_(sheet,n){
  sheet.setFrozenRows(1);
  sheet.getRange(1,1,1,n).setBackground('#2f6e50').setFontColor('#ffffff').setFontWeight('bold').setWrap(true);
}
function gcSettings_() {
  const sheet=gcBook_().getSheetByName(GCX.settings);
  if (!sheet || sheet.getLastRow()<2) throw new Error('Запустите gcSetup и заполните лист «Настройки».');
  const map={};
  sheet.getRange(2,1,sheet.getLastRow()-1,2).getDisplayValues().forEach(r=>{map[String(r[0]).trim()]=String(r[1]).trim();});
  return map;
}
function gcBase_() {
  const value=gcSettings_()['Адрес школы'];
  if (!value || value.indexOf('example.getcourse.ru')!==-1) throw new Error('Укажите настоящий адрес школы в листе «Настройки».');
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i.test(value)) throw new Error('Адрес школы должен иметь вид https://school.ru (без пути и параметров).');
  return value.replace(/\/$/,'');
}
function gcLoginUrl_(){return gcBase_()+'/cms/system/login?required=true';}
function gcCreds_(){
  const props=PropertiesService.getScriptProperties();
  const login=String(props.getProperty(GCX.propertyLogin)||'').trim();
  const password=String(props.getProperty(GCX.propertyPassword)||'');
  if(!login||!password)throw new Error('Заполните GC_LOGIN и GC_PASSWORD в свойствах скрипта.');
  return {login:login,password:password};
}
function gcDefinitions_() {
  const sheet=gcBook_().getSheetByName(GCX.definitions);
  if(!sheet||sheet.getLastRow()<2)throw new Error('Заполните лист «Рассылки».');
  const ids=new Set();
  return sheet.getRange(2,1,sheet.getLastRow()-1,GCX.defColumns.length).getDisplayValues()
    .filter(r=>/^(true|да|1|yes)$/i.test(String(r[0]).trim()))
    .map(r=>{
      const id=String(r[1]).trim();
      if(!/^\d+$/.test(id))throw new Error('Некорректный ID рассылки: '+id);
      if(ids.has(id))throw new Error('Повторяется ID рассылки: '+id);
      ids.add(id);
      const base=gcBase_();
      const defaultUrl=base+'/notifications/control/mailings/update/id/'+id;
      const url=String(r[4]||'').trim()||defaultUrl;
      if(!url.startsWith(base+'/'))throw new Error('Ссылка рассылки '+id+' должна принадлежать школе '+base);
      return {id:id,name:r[2],channel:r[3],url:url,
        baseline:r.slice(5,13).map(gcNumber_)};
    });
}
function gcNumber_(v){const n=Number(String(v||'0').replace(/\s/g,'').replace(',','.'));return Number.isFinite(n)?n:0;}
function gcLog_(level,id,msg){
  try{gcSheet_(GCX.journal).appendRow([new Date(),level,String(id||''),String(msg||'').slice(0,1000)]);}catch(e){console.error(e);}
}
function gcTestConnection(){
  const c=gcCreds_();
  gcMailingLoginV2_(c.login,c.password);
  gcLog_('OK','','Авторизация подтверждена');
  SpreadsheetApp.getUi().alert('Подключение к GetCourse успешно.');
}
function gcSyncMailings(){
  const lock=LockService.getDocumentLock()||LockService.getScriptLock();
  if(!lock.tryLock(10000))throw new Error('Другая синхронизация уже выполняется.');
  try{return gcSyncMailingsInternal_();}
  finally{lock.releaseLock();}
}
function gcSyncMailingsInternal_(){
  const defs=gcDefinitions_();
  if(!defs.length)throw new Error('Нет активных рассылок. Отметьте «Да» в столбце «Активна».');
  const c=gcCreds_();
  const cookies=gcMailingLoginV2_(c.login,c.password);
  const cookieHeader=gcMailingCookieHeaderV2_(cookies);
  const base=gcBase_();
  const settings=gcSettings_();
  const batch=Math.min(50,Math.max(1,Math.floor(gcNumber_(settings['Размер пакета запросов']||20))));
  const now=new Date(),rows=[],errors=[];
  for(let start=0;start<defs.length;start+=batch){
    const items=defs.slice(start,start+batch);
    const requests=items.map(item=>({url:item.url,method:'get',headers:{
      Accept:'text/html,*/*',Cookie:cookieHeader,Referer:base+'/notifications/control/mailings/index'
    },followRedirects:true,muteHttpExceptions:true}));
    let responses;
    try{responses=UrlFetchApp.fetchAll(requests);}catch(e){
      items.forEach(item=>{errors.push(item.id+': '+e.message);gcLog_('ERROR',item.id,e.message);});
      continue;
    }
    responses.forEach((response,i)=>{
      const item=items[i],status=response.getResponseCode(),html=response.getContentText('UTF-8');
      if(status<200||status>=300||!html.includes('Статистика рассылки')){
        const msg='HTTP '+status+': статистика недоступна (авторизация, права или HTML)';
        errors.push(item.id+': '+msg);gcLog_('ERROR',item.id,msg);return;
      }
      try{
        const raw=gcParseMailingV2_(html,item);
        rows.push(gcMailingOutputRowV2_(raw,item,now));
      }catch(e){errors.push(item.id+': '+e.message);gcLog_('ERROR',item.id,e.message);}
    });
  }
  if(!rows.length)throw new Error('Нет успешно обработанных рассылок. Проверьте лист «Журнал».');
  // Не теряем данные неудачных рассылок: обновляем только успешно полученные ID.
  gcUpsertRows_(rows,defs);
  gcLog_('OK','', 'Обновлено '+rows.length+' из '+defs.length+'; ошибок: '+errors.length);
  return {updated:rows.length,failed:errors.length,errors:errors};
}
function gcUpsertRows_(incoming,defs){
  const sheet=gcSheet_(GCX.results),cols=GCX.columns.length;
  gcEnsureColumns_(sheet,cols);
  sheet.getRange(1,1,1,cols).setValues([GCX.columns]);
  const oldCount=Math.max(0,sheet.getLastRow()-1);
  const existing=oldCount?sheet.getRange(2,1,oldCount,cols).getValues():[];
  const merged=new Map();
  existing.forEach(r=>{const id=String(r[1]||'').trim();if(id)merged.set(id,r);});
  incoming.forEach(r=>merged.set(String(r[1]),r));
  // Порядок строго соответствует листу «Рассылки» (сверху вниз).
  // Для временно не обновившихся активных рассылок сохраняем старую статистику.
  // Рассылки, которых больше нет среди активных, помещаем в конец без потери данных.
  const order=new Map(defs.map((item,index)=>[String(item.id),index]));
  const rows=Array.from(merged.values()).sort((a,b)=>{
    const aId=String(a[1]||'').trim();
    const bId=String(b[1]||'').trim();
    const aIndex=order.has(aId)?order.get(aId):Number.MAX_SAFE_INTEGER;
    const bIndex=order.has(bId)?order.get(bId):Number.MAX_SAFE_INTEGER;
    return aIndex-bIndex;
  });
  if(sheet.getMaxRows()<rows.length+1)sheet.insertRowsAfter(sheet.getMaxRows(),rows.length+1-sheet.getMaxRows());
  if(oldCount)sheet.getRange(2,1,oldCount,cols).clearContent();
  if(rows.length){
    sheet.getRange(2,1,rows.length,cols).setValues(rows);
    sheet.getRange(2,1,rows.length,1).setNumberFormat('dd.MM.yyyy HH:mm:ss');
    [10,12,13,14,16].forEach(col=>sheet.getRange(2,col,rows.length,1).setNumberFormat('0.0%'));
    const links=rows.map(r=>{
      const def=defs.find(d=>d.id===String(r[1]));
      const url=def?def.url:gcBase_()+'/notifications/control/mailings/update/id/'+r[1];
      return [SpreadsheetApp.newRichTextValue().setText(String(r[1])).setLinkUrl(url).build()];
    });
    sheet.getRange(2,2,rows.length,1).setRichTextValues(links);
  }
}
function gcInstallDailyTrigger(){
  gcRemoveTriggers();
  const zone=gcSettings_()['Часовой пояс']||'Europe/Moscow';
  ScriptApp.newTrigger('gcSyncMailings').timeBased().everyDays(1).atHour(8).inTimezone(zone).create();
  gcLog_('OK','','Ежедневный триггер установлен на ~08:00 '+zone);
}
function gcRemoveTriggers(){
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='gcSyncMailings')
    .forEach(t=>ScriptApp.deleteTrigger(t));
}

function gcMailingLoginV2_(login, password) {
  login = String(login || '').trim();
  password = String(password || '');
  if (!login || !password) throw new Error('Не заполнены GC_LOGIN или GC_PASSWORD.');

  const cookies = {};
  const page = UrlFetchApp.fetch(gcLoginUrl_(), {
    method: 'get',
    followRedirects: false,
    muteHttpExceptions: true,
    headers: { Accept: '*/*', 'Cache-Control': 'no-cache' }
  });
  gcMergeMailingCookiesV2_(page, cookies);

  if (page.getResponseCode() < 200 || page.getResponseCode() >= 400) {
    throw new Error('Страница входа GetCourse: HTTP ' + page.getResponseCode());
  }

  const html = page.getContentText('UTF-8');
  const requestTime = gcFirstMatchV2_(html, [
    /window\.requestTime\s*=\s*["']?(\d+)["']?/i,
    /requestTime["']?\s*[:=]\s*["']?(\d+)["']?/i
  ]);
  const simpleSign = gcFirstMatchV2_(html, [
    /window\.requestSimpleSign\s*=\s*["']([^"']+)["']/i,
    /requestSimpleSign["']?\s*[:=]\s*["']([^"']+)["']/i
  ]);
  const xdgetId = gcLoginFormIdV2_(html);
  if (!requestTime || !simpleSign || !xdgetId) {
    throw new Error('Не удалось разобрать форму входа GetCourse.');
  }

  const fields = {
    action: 'processXdget',
    xdgetId: xdgetId,
    'params[action]': 'login',
    'params[url]': gcLoginUrl_(),
    'params[email]': login,
    'params[password]': password,
    'params[object_type]': 'cms_page',
    'params[object_id]': '-1',
    'params[pdpConfirmCheckbox]': '0',
    requestTime: requestTime,
    requestSimpleSign: simpleSign
  };

  const response = UrlFetchApp.fetch(gcLoginUrl_(), {
    method: 'post',
    payload: gcFormEncodeV2_(fields),
    followRedirects: false,
    muteHttpExceptions: true,
    headers: {
      Accept: '*/*',
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Origin: gcBase_(),
      Referer: gcBase_() + '/cms/system/login',
      Cookie: gcMailingCookieHeaderV2_(cookies)
    }
  });

  gcMergeMailingCookiesV2_(response, cookies);
  let payload = null;
  try {
    payload = JSON.parse(response.getContentText('UTF-8'));
  } catch (error) {}

  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 ||
      !payload || !payload.success || !Object.keys(cookies).some(function(k){return /^PHPSESSID/i.test(k);})) {
    throw new Error('GetCourse не подтвердил авторизацию.');
  }
  return cookies;
}



function gcParseMailingV2_(html, item) {
  const main = gcPanelV2_(html, 'Статистика рассылки');
  const users = gcPanelV2_(html, 'Статистика пользователей');
  const result = {
    total: gcIntegerV2_(gcTableValueV2_(main, 'Всего сообщений')),
    delivered: gcIntegerV2_(gcTableValueV2_(main, 'доставлено')),
    errors: gcIntegerV2_(gcTableValueV2_(main, 'ошибка')),
    restricted: gcIntegerV2_(gcTableValueV2_(main, 'запрещено')),
    views: 0,
    clicks: 0,
    unsubscribes: 0,
    selfUnsubscribes: 0
  };

  if (users) {
    const viewed = gcLinkByTokenV2_(users, 'viewed=1');
    const clicked = gcLinkByTokenV2_(users, 'clicked=1');
    const selfUnsubscribed = gcLinkByTokenV2_(users, 'unsubscribeReason=list');
    if (viewed) result.views = gcIntegerV2_(viewed.text) || 0;
    if (clicked) result.clicks = gcIntegerV2_(clicked.text) || 0;

    const text = gcStripHtmlV2_(users);
    const unsubscribed = text.match(/(\d[\d\s]*)\s+отпис\w*\s*\(([\d.,]+)%\)/i);
    if (unsubscribed) result.unsubscribes = Number(unsubscribed[1].replace(/\s/g, ''));

    if (selfUnsubscribed) {
      const match = selfUnsubscribed.text.match(/:\s*(\d[\d\s]*)/);
      if (match) result.selfUnsubscribes = Number(match[1].replace(/\s/g, ''));
    }
  }
  return result;
}



function gcMailingOutputRowV2_(raw, item, collectedAt) {
  const baseline = item.baseline.concat([0, 0, 0, 0, 0, 0, 0, 0]).slice(0, 8);
  const current = [raw.total, raw.delivered, raw.errors, raw.restricted,
    raw.views, raw.clicks, raw.unsubscribes, raw.selfUnsubscribes];
  const value = current.map(function(number, index) {
    return Math.max(0, gcNumber_(number) - gcNumber_(baseline[index]));
  });

  const total = value[0];
  const delivered = value[1];
  const views = value[4];
  const clicks = value[5];
  const unsubscribes = value[6];

  return [
    collectedAt,
    item.id,
    item.name,
    item.channel,
    total,
    delivered,
    value[2],
    value[3],
    views,
    delivered ? views / delivered : '',
    clicks,
    delivered ? clicks / delivered : '',
    views ? clicks / views : '',
    total ? (value[2] + value[3]) / total : '',
    unsubscribes,
    delivered ? unsubscribes / delivered : ''
  ];
}



function gcLoginFormIdV2_(html) {
  const regex = /<form\b[^>]*>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const tag = match[0];
    const classMatch = tag.match(/class=["']([^"']*)["']/i);
    if (!classMatch || !/\bxdget-loginUserForm\b/i.test(classMatch[1])) continue;
    const idMatch = tag.match(/data-xdget-id=["']([^"']+)["']/i);
    if (idMatch) return gcDecodeHtmlV2_(idMatch[1]);
  }
  return null;
}



function gcMergeMailingCookiesV2_(response, jar) {
  const headers = response.getAllHeaders();
  Object.keys(headers).forEach(function(key) {
    if (String(key).toLowerCase() !== 'set-cookie') return;
    const values = Array.isArray(headers[key]) ? headers[key] : [headers[key]];
    values.forEach(function(value) {
      String(value).split(/,(?=[^;,=\s]+=[^;,]+)/).forEach(function(line) {
        const pair = line.split(';')[0];
        const index = pair.indexOf('=');
        if (index <= 0) return;
        const name = pair.slice(0, index).trim();
        const cookieValue = pair.slice(index + 1).trim();
        if (cookieValue) jar[name] = cookieValue;
        else delete jar[name];
      });
    });
  });
}



function gcMailingCookieHeaderV2_(jar) {
  return Object.keys(jar).map(function(key) { return key + '=' + jar[key]; }).join('; ');
}



function gcFormEncodeV2_(object) {
  return Object.keys(object).map(function(key) {
    return encodeURIComponent(key) + '=' + encodeURIComponent(object[key]);
  }).join('&');
}



function gcPanelV2_(html, heading) {
  const headingIndex = html.indexOf(heading);
  if (headingIndex < 0) return null;
  const bodyIndex = html.indexOf('panel-body', headingIndex);
  const openIndex = html.indexOf('>', bodyIndex);
  const endIndex = html.indexOf('</div>', openIndex + 1);
  return bodyIndex < 0 || openIndex < 0 || endIndex < 0
    ? null : html.slice(openIndex + 1, endIndex);
}



function gcTableValueV2_(html, label) {
  if (!html) return null;
  const regex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const cells = [];
    const cellRegex = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
    let cell;
    while ((cell = cellRegex.exec(match[1])) !== null) cells.push(cell[1]);
    if (cells.length > 1 && gcStripHtmlV2_(cells[0]).toLowerCase() === label.toLowerCase()) {
      return gcStripHtmlV2_(cells[1]);
    }
  }
  return null;
}



function gcLinkByTokenV2_(html, token) {
  const regex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    if (gcDecodeHtmlV2_(match[1]).indexOf(token) !== -1) {
      return { text: gcStripHtmlV2_(match[2]) };
    }
  }
  return null;
}



function gcStripHtmlV2_(value) {
  return gcDecodeHtmlV2_(String(value || '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ').trim();
}



function gcDecodeHtmlV2_(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}



function gcIntegerV2_(value) {
  if (!value) return 0;
  const match = String(value).match(/\d[\d\s]*/);
  return match ? Number(match[0].replace(/\s/g, '')) : 0;
}



function gcFirstMatchV2_(value, patterns) {
  for (let i = 0; i < patterns.length; i += 1) {
    const match = String(value).match(patterns[i]);
    if (match && match[1]) return match[1];
  }
  return null;
}
