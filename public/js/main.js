(function(){
  var root=document.documentElement;

  /* Some Android viewers open local files through content:// URIs and ignore the
     viewport meta, laying the page out at ~980px. Detect that and re-assert it. */
  try{
    var cw=root.clientWidth, sw=(window.screen&&screen.width)?screen.width:cw;
    if(cw>sw*1.4){
      var old=document.querySelector('meta[name="viewport"]');
      var vm=document.createElement('meta');
      vm.setAttribute('name','viewport');
      vm.setAttribute('content','width=device-width, initial-scale=1, viewport-fit=cover');
      if(old&&old.parentNode)old.parentNode.replaceChild(vm,old);
      else document.head.appendChild(vm);
    }
  }catch(e){}

  /* theme follows the system, live */
  function updateMeta(t){var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='dark'?'#0a0a0b':'#ffffff');}
  try{
    var mq=matchMedia('(prefers-color-scheme: dark)');
    var applyScheme=function(e){var t=e.matches?'dark':'light';root.setAttribute('data-theme',t);updateMeta(t);};
    if(mq.addEventListener)mq.addEventListener('change',applyScheme);
    else if(mq.addListener)mq.addListener(applyScheme);
  }catch(e){}

  /* header shadow on scroll */
  var header=document.getElementById('siteHeader');
  function onScroll(){if(window.scrollY>8)header.classList.add('scrolled');else header.classList.remove('scrolled');}
  onScroll();window.addEventListener('scroll',onScroll,{passive:true});

  /* reveal on scroll */
  var rev=document.querySelectorAll('.reveal');
  if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(entries){
      entries.forEach(function(en){if(en.isIntersecting){en.target.classList.add('is-visible');io.unobserve(en.target);}});
    },{rootMargin:'0px 0px -8% 0px',threshold:0.08});
    for(var k=0;k<rev.length;k++){io.observe(rev[k]);}
  }else{for(var m2=0;m2<rev.length;m2++){rev[m2].classList.add('is-visible');}}
  /* safety net: never leave content hidden */
  window.addEventListener('load',function(){setTimeout(function(){for(var n=0;n<rev.length;n++){if(!rev[n].classList.contains('is-visible'))rev[n].classList.add('is-visible');}},1400);});

  /* rotating headline (typewriter, both lines) */
  (function(){
    var l1=document.getElementById('rotL1'),l2=document.getElementById('rotL2'),
        t1=document.getElementById('rotT1'),t2=document.getElementById('rotT2');
    if(!l1||!l2||!t1||!t2)return;
    var reduce=false;try{reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;}catch(e){}
    if(reduce)return;

    /* every line kept to <=19 chars: each fits one line, so the page never jumps */
    var P=[
      ['Comparte tu mundo.','Encuentra tu gente.'],
      ['Publica lo tuyo.','Cuenta tu historia.'],
      ['Mira qué se mueve.','Sigue tendencias.'],
      ['Busca a los tuyos.','Crea tu comunidad.'],
      ['Habla de verdad.','Conecta sin ruido.'],
      ['Muestra tu talento.','Deja tu huella.'],
      ['Vive el momento.','Compártelo ya.'],
      ['Rompe el hielo.','Haz nuevos amigos.'],
      ['Sube tu historia.','Que te vean hoy.'],
      ['Encuentra tu voz.','Que te escuchen.'],
      ['Sigue lo que amas.','Descubre creadores.'],
      ['Abre la charla.','Únete al grupo.'],
      ['Tu gente te espera.','Escríbeles ya.'],
      ['Crea algo tuyo.','Hazlo con tu gente.'],
      ['Comparte tu día.','Sin filtros raros.'],
      ['Explora sin fin.','Descubre tu tribu.'],
      ['Di lo que piensas.','Habla sin miedo.'],
      ['Sigue el momento.','Vive lo que pasa.'],
      ['Tu historia cuenta.','Publícala hoy.'],
      ['Todo pasa aquí.','Únete a la charla.']
    ];

    var T1=0,T2=1,PAUSE=2,D2=3,D1=4;
    var i=0,st=PAUSE,c1=P[0][0].length,c2=P[0][1].length,timer=null,inView=true;

    function focusLine(n,solid){
      l1.classList.toggle('on',n===1);l2.classList.toggle('on',n===2);
      l1.classList.toggle('is-typing',n===1&&solid);
      l2.classList.toggle('is-typing',n===2&&solid);
    }
    /* a beat longer after a space, like a real typist */
    function sp(s,n){return (s.charAt(n-1)===' '?90:40)+Math.random()*45;}
    function at(d){timer=setTimeout(tick,d);}
    function tick(){
      var a=P[i][0],b=P[i][1];
      if(st===T1){
        focusLine(1,true);c1++;t1.textContent=a.slice(0,c1);
        if(c1>=a.length){st=T2;return at(240);}
        return at(sp(a,c1));
      }
      if(st===T2){
        focusLine(2,true);c2++;t2.textContent=b.slice(0,c2);
        if(c2>=b.length){st=PAUSE;focusLine(2,false);return at(1800);}
        return at(sp(b,c2));
      }
      if(st===PAUSE){st=D2;return at(0);}
      if(st===D2){
        focusLine(2,true);c2--;t2.textContent=b.slice(0,c2);
        if(c2<=0){st=D1;return at(120);}
        return at(20+Math.random()*16);
      }
      /* D1 */
      focusLine(1,true);c1--;t1.textContent=a.slice(0,c1);
      if(c1<=0){st=T1;i=(i+1)%P.length;return at(240);}
      return at(20+Math.random()*16);
    }
    function stop(){if(timer){clearTimeout(timer);timer=null;}}

    /* let the opening pair sit before it starts erasing */
    timer=setTimeout(function(){timer=null;tick();},2200);
    if('IntersectionObserver' in window){
      var io3=new IntersectionObserver(function(en){
        for(var k=0;k<en.length;k++)inView=en[k].isIntersecting;
        if(!inView)stop();else if(!timer&&!document.hidden)at(200);
      },{threshold:0});
      io3.observe(l1);
    }
    document.addEventListener('visibilitychange',function(){
      if(document.hidden)stop();else if(inView&&!timer)at(200);
    });
  })();

  /* live group chat demo */
  (function(){
    var feed=document.getElementById('chatFeed');
    if(!feed)return;
    var reduce=false;try{reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;}catch(e){}

    var U={
      lucia:{n:'lucia_dev',a:'av-b',i:'L'},
      mateo:{n:'mateo.d',a:'av-c',i:'M'},
      sofia:{n:'sofia.code',a:'av-d',i:'S'},
      andres:{n:'andres_r',a:'av-e',i:'A'}
    };
    var THREADS=[
      [{u:'lucia',t:'¿Alguien ha migrado ya a Kotlin 2.1?'},{u:'me',t:'Sí, el compilador K2 va volando'},{u:'mateo',t:'Confirmo, el build me bajó a la mitad'}],
      [{u:'sofia',t:'Mi build tarda 4 minutos, ¿ideas?'},{u:'me',t:'Activa el build cache en gradle.properties'},{u:'sofia',t:'Bajó a 40 segundos, gracias'}],
      [{u:'mateo',t:'¿RecyclerView o LazyColumn para la lista?'},{u:'me',t:'LazyColumn, sin discusión'},{u:'andres',t:'Y te ahorras el adapter entero'}],
      [{u:'lucia',t:'Os dejo el snippet del ViewModel'},{u:'lucia',c:'fun cargar() = viewModelScope.launch {\n    _estado.value = repo.obtener()\n}'},{u:'me',t:'Justo lo que necesitaba, gracias'}],
      [{u:'andres',t:'Ese crash era un NullPointer tonto'},{u:'me',t:'Nos ha pasado a todos'},{u:'lucia',t:'Bienvenido al club'}],
      [{u:'sofia',t:'Acabo de publicar la beta'},{u:'mateo',t:'Instalando ahora mismo'},{u:'me',t:'Le doy caña esta tarde'}],
      [{u:'mateo',t:'¿Room o SQLDelight?'},{u:'me',t:'Room si ya usas Jetpack'},{u:'sofia',t:'SQLDelight si te importa multiplataforma'}]
    ];

    var MAX=6,ti=Math.floor(Math.random()*THREADS.length),mi=0,timer=null,live=false,inView=false;

    function bubble(m){
      var out=m.u==='me',who=out?null:U[m.u];
      var row=document.createElement('div');
      row.className='msg'+(out?' out':'');
      if(!out){var av=document.createElement('span');av.className='m-ava '+who.a;av.textContent=who.i;row.appendChild(av);}
      var body=document.createElement('div');body.className='m-body';
      if(!out){var nm=document.createElement('div');nm.className='m-name';nm.textContent=who.n;body.appendChild(nm);}
      var b=document.createElement('div');
      if(m.c){b.className='m-code';b.textContent=m.c;}else{b.className='m-bub';b.textContent=m.t;}
      body.appendChild(b);row.appendChild(body);
      return row;
    }
    function typingRow(m){
      var who=U[m.u];
      var row=document.createElement('div');row.className='msg';row.setAttribute('data-typing','1');
      var av=document.createElement('span');av.className='m-ava '+who.a;av.textContent=who.i;
      var body=document.createElement('div');body.className='m-body';
      var b=document.createElement('div');b.className='m-bub typing';
      b.appendChild(document.createElement('i'));b.appendChild(document.createElement('i'));b.appendChild(document.createElement('i'));
      body.appendChild(b);row.appendChild(av);row.appendChild(body);
      return row;
    }
    function dropTyping(){var t=feed.querySelector('[data-typing]');if(t&&t.parentNode)t.parentNode.removeChild(t);}
    function trim(){while(feed.children.length>MAX)feed.removeChild(feed.firstChild);}

    function advance(d){
      mi++;
      if(mi>=THREADS[ti].length){
        mi=0;
        var n=ti;while(n===ti&&THREADS.length>1)n=Math.floor(Math.random()*THREADS.length);
        ti=n;d+=1000;
      }
      timer=setTimeout(step,d);
    }
    function step(){
      if(!live)return;
      var m=THREADS[ti][mi];
      if(m.u==='me'){
        feed.appendChild(bubble(m));trim();advance(750+Math.random()*600);
      }else{
        feed.appendChild(typingRow(m));trim();
        timer=setTimeout(function(){
          if(!live)return;
          dropTyping();feed.appendChild(bubble(m));trim();advance(800+Math.random()*700);
        },650+Math.random()*700);
      }
    }
    function start(){if(live)return;live=true;step();}
    function stop(){live=false;if(timer){clearTimeout(timer);timer=null;}dropTyping();}
    function sync(){(inView&&!document.hidden)?start():stop();}

    if(reduce){
      var th=THREADS[0];
      for(var i=0;i<th.length;i++){var r=bubble(th[i]);r.style.animation='none';feed.appendChild(r);}
      return;
    }
    if('IntersectionObserver' in window){
      var io2=new IntersectionObserver(function(en){
        for(var i=0;i<en.length;i++){inView=en[i].isIntersecting;}
        sync();
      },{threshold:.15});
      io2.observe(feed);
    }else{inView=true;sync();}
    document.addEventListener('visibilitychange',sync);
  })();

  /* year */
  var y=document.getElementById('year');if(y)y.textContent=new Date().getFullYear();
})();