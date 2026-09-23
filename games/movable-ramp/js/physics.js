/* Finite quarter-circle ramp, followed by free flight and smooth re-entry. */
(function (root) {
  'use strict';
  const g = 9.8, R = 1.5, entranceHeight = 0.4, edge = Math.PI / 2;
  function simulate(m, M, v0) {
    if (![m, M, v0].every(v => Number.isFinite(v) && v > 0)) throw new Error('Parameters must be positive.');
    const alpha = m / (m + M), beta = M / (m + M);
    // Smaller steps resolve rapid angular acceleration for very light bases.
    const dt = Math.min(1/1200, .002*Math.sqrt(beta)/v0);
    const hMax = beta * v0 * v0 / (2 * g), criticalSpeed = Math.sqrt(2*g*R/beta);
    const willFly = hMax > R + 1e-10;
    function derivative(theta, omega) {
      const sn = Math.sin(theta), cs = Math.cos(theta);
      return [omega, -(alpha*sn*cs*omega*omega + g/R*sn) / (beta + alpha*sn*sn)];
    }
    function advance(theta, omega, h) {
      const a = derivative(theta, omega);
      const b = derivative(theta + a[0]*h/2, omega + a[1]*h/2);
      const c = derivative(theta + b[0]*h/2, omega + b[1]*h/2);
      const d = derivative(theta + c[0]*h, omega + c[1]*h);
      return [theta + h*(a[0]+2*b[0]+2*c[0]+d[0])/6, omega + h*(a[1]+2*b[1]+2*c[1]+d[1])/6];
    }
    function energies(s) {
      return {...s, km:m*(s.vx*s.vx+s.vy*s.vy)/2, kM:M*s.V*s.V/2, pe:m*g*(s.h+entranceHeight)};
    }
    function state(t, theta, omega) {
      const q = R*Math.sin(theta), u = R*Math.cos(theta)*omega;
      const X = alpha*(v0*t-q), V = alpha*(v0-u);
      return energies({t,theta,omega,q,u,X,V,x:X+q,vx:V+u,vy:R*Math.sin(theta)*omega,h:R*(1-Math.cos(theta)),phase:'contact'});
    }
    let launch = null, reentry = null;
    function flight(time) {
      const tau = time-launch.t, V = alpha*v0;
      const X = launch.X+V*tau;
      return energies({t:time,theta:edge,omega:0,q:R,u:0,X,V,x:X+R,vx:V,
        vy:launch.vy-g*tau,h:R+launch.vy*tau-g*tau*tau/2,phase:'flight'});
    }
    // Locate events inside an integration step, avoiding a jump at either end.
    function eventTime(theta,omega,predicate) {
      let lo=0,hi=dt;
      for(let j=0;j<40;j++) {const mid=(lo+hi)/2;if(predicate(advance(theta,omega,mid)))hi=mid;else lo=mid;}
      return (lo+hi)/2;
    }
    const samples=[state(0,0,v0/R)];
    let theta=0,omega=v0/R,t=0,peak;
    for(let i=0;i<Math.ceil(60/dt);i++) {
      const [nt,nw]=advance(theta,omega,dt);
      if(willFly && !launch && nt>=edge) {
        t+=eventTime(theta,omega,p=>p[0]>=edge);
        const exitOmega=Math.sqrt(beta*v0*v0-2*g*R)/R;
        launch=state(t,edge,exitOmega);
        samples.push(launch);
        const flightDuration=2*launch.vy/g;
        peak=flight(t+launch.vy/g);
        for(let k=1;k*dt<flightDuration;k++)samples.push(flight(t+k*dt));
        t+=flightDuration;theta=edge;omega=-exitOmega;
        reentry=state(t,theta,omega);samples.push(reentry);
        continue;
      }
      if(!willFly && omega>0 && nw<=0) {
        const tau=eventTime(theta,omega,p=>p[1]<=0);
        peak=state(t+tau,Math.acos(Math.max(-1,1-hMax/R)),0);
      }
      if(nt<0 && nw<0) {
        t+=eventTime(theta,omega,p=>p[0]<=0);
        samples.push(state(t,0,-v0/R));break;
      }
      t+=dt;theta=nt;omega=nw;samples.push(state(t,theta,omega));
    }
    if(!peak || samples.at(-1).q!==0)throw new Error('Simulation did not finish.');
    const exit=samples.at(-1), fallDuration=Math.sqrt(2*entranceHeight/g);
    function fall(time) {
      const tau=time-exit.t, X=exit.X+exit.V*tau, x=exit.x+exit.vx*tau;
      return energies({t:time,theta:0,omega:0,q:x-X,u:exit.vx-exit.V,X,V:exit.V,x,vx:exit.vx,
        vy:-g*tau,h:-g*tau*tau/2,phase:'fall'});
    }
    for(let k=1;k*dt<fallDuration;k++)samples.push(fall(exit.t+k*dt));
    const end=fall(exit.t+fallDuration);
    end.h=-entranceHeight;end.pe=0;
    samples.push(end);
    function at(time) {
      if(time<=0)return samples[0];
      if(time>=end.t)return end;
      if(time>=exit.t)return fall(time);
      if(Math.abs(time-peak.t)<1e-10)return peak;
      if(launch && time>=launch.t && time<reentry.t)return flight(time);
      let lo=0,hi=samples.length-1;
      while(lo+1<hi){const mid=(lo+hi)>>1;if(samples[mid].t<=time)lo=mid;else hi=mid;}
      const a=samples[lo], [theta,omega]=advance(a.theta,a.omega,time-a.t);
      return state(time,theta,omega);
    }
    return {m,M,v0,g,R,entranceHeight,hMax,criticalSpeed,willFly,launch,reentry,peak,exit,end,samples,at,energy:m*v0*v0/2+m*g*entranceHeight,momentum:m*v0};
  }
  root.RampPhysics={simulate};
  if(typeof module!=='undefined')module.exports={simulate};
})(typeof window!=='undefined'?window:globalThis);
