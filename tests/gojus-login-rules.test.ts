import assert from 'node:assert/strict';
import test from 'node:test';
import {exactHttpsUrl,validatedLogin} from '../lib/gojus/login-rules';
const url='https://gojus.example.com/login';
test('only exact authorized https URL and exact password accepted',()=>{
  assert.deepEqual(validatedLogin({url,email:'robot@example.com',password:' space '},url),{url,email:'robot@example.com',password:' space '});
  for(const x of ['http://gojus.example.com/login','https://127.0.0.1/login','https://user:pass@gojus.example.com/login','https://gojus.example.com/login?x=1','https://gojus.example.com:444/login','https://x.internal/login'])assert.equal(exactHttpsUrl(x),null);
  assert.equal(validatedLogin({url:'https://other.example.com/login',email:'robot@example.com',password:'x'},url),null);
  assert.equal(validatedLogin({url,email:'robot@example.com',password:'\u0000'},url),null);
});
