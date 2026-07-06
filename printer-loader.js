// プリンターIPからePOS SDKを動的に読み込む。起動時には読まず、印刷時のXML送信を優先する。
(function(){
  window.loadEposSdk=function(){
    if(window.epson||window._eposLoading)return Promise.resolve(!!window.epson);
    window._eposLoading=true;
    return new Promise(resolve=>{
      const ip = localStorage.getItem('genesis_printer_ip') || '192.168.150.76';
      const isHttps = location.protocol === 'https:';
      const sources = isHttps
        ? ['https://' + ip + '/epos-2.27.0.js', 'https://' + ip + ':8043/epos-2.27.0.js']
        : ['http://' + ip + '/epos-2.27.0.js', 'http://' + ip + ':8008/epos-2.27.0.js'];
      sources.push('epos-2.27.0.js');

      let idx = 0;
      function loadNext(){
        if(idx >= sources.length){
          window._eposFailed = true;
          window._eposLoading=false;
          resolve(false);
          return;
        }
        const s = document.createElement('script');
        s.src = sources[idx++];
        s.onload = function(){ window._eposLoading=false; resolve(true); };
        s.onerror = loadNext;
        document.head.appendChild(s);
      }
      loadNext();
    });
  };
})();
