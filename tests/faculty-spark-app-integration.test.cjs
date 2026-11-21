'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {createSparkApp}=require('../faculty-fund-spark-app.js');
test('production project cannot start Spark demo mode and the app ships with it disabled',()=>{
 const names=['createClient','createReader','project','createReadAdapter','createWriteAdapter','createReceipts','makeReport','reportCsv','makeExport','createPendingReader','createPendingInspector','createDiscovery','createResolver','createExpenseResumer','createPagedRecovery'],modules=Object.fromEntries(names.map(name=>[name,()=>{}]));
 assert.throws(()=>createSparkApp({db:{app:{options:{projectId:'russapps-pondo'}}},api:{},getContext:()=>null,modules}),/demo Firebase project/);
 const html=fs.readFileSync('index.html','utf8');assert.doesNotMatch(html,/FACULTY_FUND_SPARK_DEMO|createFacultyFundSparkApp/);
});
