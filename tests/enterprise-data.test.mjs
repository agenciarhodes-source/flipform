import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeEnterpriseFixture, enterpriseFixtureKey, asaasReadPlan, normalizeAsaasPage, bcbPlan, normalizeBcb, selectEnterpriseSource } from '../lib/universal-connectors/enterprise-data.mjs';
const tenantId="12345678-1234-1234-1234-123456789abc";
const other="22345678-1234-1234-1234-123456789abc";
const observedAt="2026-11-26T00:00:00.000Z";
const erp={"tenantId":"12345678-1234-1234-1234-123456789abc","connectionId":"erp-fixture","providerId":"fixture_erp","accountId":"erp-account","environment":"fixture","kinds":["order","inventory_snapshot","payable"]};
const crm={"tenantId":"12345678-1234-1234-1234-123456789abc","connectionId":"crm-fixture","providerId":"fixture_crm","accountId":"crm-account","environment":"fixture","kinds":["crm_opportunity"]};
const asaas={"tenantId":"12345678-1234-1234-1234-123456789abc","connectionId":"asaas-fixture","providerId":"asaas_sandbox","accountId":"account-fixture","environment":"sandbox","kinds":["receivable"]};
const grants=[{"tenantId":"12345678-1234-1234-1234-123456789abc","connectionId":"erp-fixture","providerId":"fixture_erp","accountId":"erp-account","environment":"fixture","kinds":["order","inventory_snapshot","payable"]},{"tenantId":"12345678-1234-1234-1234-123456789abc","connectionId":"crm-fixture","providerId":"fixture_crm","accountId":"crm-account","environment":"fixture","kinds":["crm_opportunity"]},{"tenantId":"12345678-1234-1234-1234-123456789abc","connectionId":"asaas-fixture","providerId":"asaas_sandbox","accountId":"account-fixture","environment":"sandbox","kinds":["receivable"]}];
const w={"since":"2026-11-01","until":"2026-11-26"};
const order={"id":"ord1","status":"confirmed","orderDate":"2026-11-02","money":{"currency":"BRL","amountMinor":10000},"updatedAt":"2026-11-02T12:00:00.000Z","customerName":"Private fixture","tenantId":"22345678-1234-1234-1234-123456789abc"};
const payment={"object":"payment","id":"pay_fixture1","status":"CONFIRMED","value":100.25,"dueDate":"2026-11-10","customer":"cus_private","invoiceUrl":"https://private.example"};
function fixtureReceipt(s,k){return {connectionId:s.connectionId,accountId:s.accountId,reportKey:enterpriseFixtureKey(s,grants,k),observedAt};}
function asaasReceipt(cursor=null){const p=asaasReadPlan(asaas,grants,w,cursor);return {connectionId:p.connectionId,accountId:p.accountId,reportKey:p.reportKey,observedAt};}
function page(data=[payment],totalCount=data.length,offset=0){return {object:"list",data,totalCount,offset,limit:100,hasMore:offset+data.length<totalCount};}
function marketReceipt(series){return {reportKey:bcbPlan(series,w).reportKey,observedAt};}
test("ERP fixture projections, exact money and no PII", ()=>{
 const a=normalizeEnterpriseFixture(erp,grants,"order",fixtureReceipt(erp,"order"),[order]);
 assert.equal(a[0].tenantId,tenantId);assert.equal(a[0].orderTotal.amountMinor,10000);assert.ok(!JSON.stringify(a).includes("Private fixture"));
 const stock=normalizeEnterpriseFixture(erp,grants,"inventory_snapshot",fixtureReceipt(erp,"inventory_snapshot"),[{id:"stock1",sku:"item-1",warehouseId:"main",quantity:15,snapshotDate:"2026-11-01"}]);
 assert.equal(stock[0].quantity,15);assert.equal(stock[0].unit,"each");
 assert.throws(()=>normalizeEnterpriseFixture(erp,grants,"order",fixtureReceipt(erp,"order"),[order,order]));
 assert.throws(()=>normalizeEnterpriseFixture(erp,grants,"order",fixtureReceipt(erp,"order"),[{...order,money:{currency:"BRL",amountMinor:10.5}}]));
});
test("CRM outcome remains distinct from cash and source selection", ()=>{
 const a=normalizeEnterpriseFixture(crm,grants,"crm_opportunity",fixtureReceipt(crm,"crm_opportunity"),[{id:"deal1",status:"won",createdDate:"2026-11-01",closedDate:"2026-11-02",money:{currency:"BRL",amountMinor:10000}}]);
 assert.equal(a[0].expectedValue.amountMinor,10000);assert.equal(a[0].cashRealized,undefined);
 assert.throws(()=>normalizeEnterpriseFixture(crm,grants,"crm_opportunity",fixtureReceipt(crm,"crm_opportunity"),[{id:"deal2",status:"won",createdDate:"2026-11-01"}]));
 const b=normalizeEnterpriseFixture(erp,grants,"order",fixtureReceipt(erp,"order"),[order]);
 assert.equal(selectEnterpriseSource([...a,...b],erp,grants,"order").records.length,1);
 assert.throws(()=>selectEnterpriseSource([...b,{...a[0],tenantId:other}],erp,grants,"order"));
 assert.throws(()=>selectEnterpriseSource([...b,...b],erp,grants,"order"));
});
test("tenant, account, connection, kind and receipt boundaries", ()=>{
 assert.throws(()=>enterpriseFixtureKey({...erp,tenantId:other},grants,"order"));
 assert.throws(()=>enterpriseFixtureKey(erp,[...grants,{...erp,tenantId:other}],"order"));
 assert.throws(()=>enterpriseFixtureKey({...erp,connectionId:"other"},grants,"order"));
 assert.throws(()=>enterpriseFixtureKey(erp,grants,"crm_opportunity"));
 assert.throws(()=>enterpriseFixtureKey(erp,[{...erp,environment:"production"}],"order"));
 assert.throws(()=>normalizeEnterpriseFixture(erp,grants,"order",fixtureReceipt(crm,"crm_opportunity"),[order]));
 assert.throws(()=>normalizeEnterpriseFixture(erp,grants,"order",fixtureReceipt(erp,"order"),[{...order,updatedAt:"2026-12-01T00:00:00.000Z"}]));
});
test("Asaas sandbox fixed endpoint and conservative financial semantics", ()=>{
 const p=asaasReadPlan(asaas,grants,w);assert.equal(p.method,"GET");assert.ok(p.url.startsWith("https://api-sandbox.asaas.com/v3/payments?"));assert.ok(decodeURIComponent(p.url).includes("dueDate[ge]=2026-11-01"));
 const a=normalizeAsaasPage(asaas,grants,w,asaasReceipt(),page());
 assert.equal(a.records[0].faceValue.amountMinor,10025);assert.equal(a.records[0].cashRealized,null);assert.equal(a.records[0].status,"confirmed");assert.ok(!JSON.stringify(a).includes("private"));
 assert.equal(normalizeAsaasPage(asaas,grants,w,asaasReceipt(),page([{...payment,status:"CHARGEBACK_REQUESTED"}])).records[0].status,"unknown");
 assert.throws(()=>asaasReadPlan(asaas,grants,{since:"2026-11-01",until:"2026-12-02"}));
 assert.throws(()=>normalizeAsaasPage(asaas,grants,w,asaasReceipt(),page([{...payment,value:10.001}])));
});
test("bounded Asaas pagination and malformed response handling", ()=>{
 const data=Array.from({length:100},(_,i)=>({...payment,id:"pay_"+i}));
 const a=normalizeAsaasPage(asaas,grants,w,asaasReceipt(),page(data,101));
 assert.equal(a.nextCursor.offset,100);
 assert.ok(asaasReadPlan(asaas,grants,w,a.nextCursor).url.includes("offset=100"));
 assert.throws(()=>normalizeAsaasPage(asaas,grants,w,asaasReceipt(),page([payment],101,100),a.nextCursor));
 assert.equal(normalizeAsaasPage(asaas,grants,w,asaasReceipt(a.nextCursor),page([payment],101,100),a.nextCursor).nextCursor,null);
 assert.throws(()=>asaasReadPlan(asaas,grants,{...w,until:"2026-11-25"},a.nextCursor));
 assert.throws(()=>normalizeAsaasPage(asaas,grants,w,asaasReceipt(),{...page(),hasMore:true}));
});
test("BCB allowlisted indicators, distinct units and dates", ()=>{
 const p=bcbPlan("432",w);assert.ok(p.url.startsWith("https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?"));assert.equal(p.auth,"none");
 const a=normalizeBcb("432",w,marketReceipt("432"),[{data:"01/11/2026",valor:"14.00"}]);assert.equal(a[0].unit,"percent_per_year");assert.equal(a[0].value,14);
 const b=normalizeBcb("433",w,marketReceipt("433"),[{data:"01/11/2026",valor:"-0.20"}]);assert.equal(b[0].unit,"percent_per_month");assert.equal(b[0].period,"2026-11");assert.equal(b[0].value,-0.2);
 assert.throws(()=>bcbPlan("999",w));assert.throws(()=>normalizeBcb("432",w,marketReceipt("433"),[{data:"01/11/2026",valor:"14"}]));
 assert.throws(()=>normalizeBcb("433",w,marketReceipt("433"),[{data:"01/11/2026",valor:"0.2"},{data:"02/11/2026",valor:"0.3"}]));
 assert.throws(()=>normalizeBcb("432",w,marketReceipt("432"),[{data:"31/11/2026",valor:"14"}]));
});
