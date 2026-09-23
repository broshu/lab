'use strict';
const assert = require('node:assert/strict');
const {simulate} = require('../js/physics.js');
let cases=0, flights=0, maxEnergyError=0;
for(const m of [.2,1,3,10]) for(const M of [.2,1,3,20]) {
  const critical=Math.sqrt(2*9.8*1.5*(m+M)/M);
  for(const speed of [.5,5,8,10,critical*(1-1e-6),critical,critical*(1+1e-6)]) {
    const s=simulate(m,M,speed);cases++;
    assert.equal(s.R,1.5);
    assert.equal(s.willFly,speed>critical*(1+1e-10));
    for(let i=0;i<=300;i++) {
      const p=s.at(s.end.t*i/300);
      const error=Math.abs((p.km+p.kM+p.pe)/s.energy-1);
      maxEnergyError=Math.max(maxEnergyError,error);
      assert.ok(error<1e-7,`Energy drift: ${m}, ${M}, ${speed}: ${error}`);
      assert.ok(Math.abs((m*p.vx+M*p.V)/s.momentum-1)<1e-10);
      assert.ok(p.h>=-s.entranceHeight-1e-10 && p.h<=s.hMax+1e-7);
      if(p.phase==='contact')assert.ok(p.theta>=-1e-10 && p.theta<=Math.PI/2+1e-8);
    }
    assert.ok(Math.abs(s.peak.h-s.hMax)<1e-8);
    assert.ok(Math.abs(s.end.vx-(m-M)*speed/(m+M))<1e-10);
    assert.ok(Math.abs(s.peak.t*2-s.exit.t)<2e-7);
    const fallTime=Math.sqrt(2*s.entranceHeight/s.g);
    assert.ok(Math.abs(s.end.t-s.exit.t-fallTime)<1e-12);
    assert.equal(s.end.phase,'fall');
    assert.equal(s.end.h+s.entranceHeight,0);
    assert.equal(s.end.pe,0);
    assert.ok(Math.abs(s.end.x-s.exit.x-s.exit.vx*fallTime)<1e-10);
    assert.ok(Math.abs(s.end.vy+s.g*fallTime)<1e-10);
    assert.ok(s.end.x<s.end.X, 'Ground contact must be clear of the base.');
    const middle=s.at(s.exit.t+fallTime/2);
    assert.ok(Math.abs(middle.h+s.entranceHeight/4)<1e-10);
    assert.ok(Math.abs(middle.vx-s.exit.vx)<1e-10);
    assert.ok(Math.abs(middle.V-s.exit.V)<1e-10);
    const beforeExit=s.at(s.exit.t-1e-8),afterExit=s.at(s.exit.t+1e-8);
    for(const key of ['x','h','X','vx','vy','V'])assert.ok(Math.abs(beforeExit[key]-afterExit[key])<2e-5,`Exit discontinuity: ${key}`);
    if(s.willFly) {
      flights++;
      assert.ok(s.launch && s.reentry && s.launch.t<s.peak.t && s.peak.t<s.reentry.t);
      assert.equal(s.peak.phase,'flight');
      assert.ok(Math.abs(s.launch.vx-s.launch.V)<1e-10);
      for(const event of [s.launch,s.reentry]) {
        const before=s.at(event.t-1e-8),after=s.at(event.t+1e-8);
        for(const key of ['x','h','X','vx','vy','V'])assert.ok(Math.abs(before[key]-after[key])<2e-5,`Discontinuity: ${key}`);
      }
      const a=s.at(s.launch.t+(s.reentry.t-s.launch.t)*.25),b=s.at(s.launch.t+(s.reentry.t-s.launch.t)*.75);
      assert.ok(Math.abs(a.V-b.V)<1e-12 && Math.abs(a.vx-b.vx)<1e-12);
      assert.ok(Math.abs((b.vy-a.vy)/(b.t-a.t)+9.8)<1e-8);
      assert.ok(Math.abs(a.x-a.X-1.5)<1e-10 && Math.abs(b.x-b.X-1.5)<1e-10);
    } else assert.equal(s.launch,null);
  }
}
console.log(JSON.stringify({cases,flights,maxEnergyError},null,2));
