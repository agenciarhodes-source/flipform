import test from 'node:test';
import assert from 'node:assert/strict';
import {validLogin,allowedRequest,verifiedLanding,testLogin} from '../workers/gojus/login-worker.mjs';
const url='https://gojus.example.com/login';
const success='https://gojus.example.com/pre-cadastro';
const input={url,email:'robot@example.com',password:'synthetic password'};
test('worker refuses arbitrary origin and credentials until authorized',async()=>{
  assert.equal(validLogin(input,url),true);
  assert.equal(validLogin({...input,url:'https://other.example.com/login'},url),false);
  assert.equal(allowedRequest('https://other.example.com/login',new URL(url).origin),false);
  assert.equal(allowedRequest('https://gojus.example.com.evil.example/login',new URL(url).origin),false);
  assert.equal(await testLogin(input,{GOJUS_LOGIN_URL:url,GOJUS_LOGIN_SUCCESS_URL:success}),'unavailable');
});
test('success requires exact verified landing and both visible landmarks',()=>{
  assert.equal(verifiedLanding(success,success,true,true,false),true);
  assert.equal(verifiedLanding(url,success,true,true,false),false);
  assert.equal(verifiedLanding(success,success,true,false,false),false);
  assert.equal(verifiedLanding(success,success,true,true,true),false);
});
