// プリンターIPからePOS SDKを動的に読み込む
(function(){
  // localStorage or デフォルトIPからSDKを読み込む
  const ip = localStorage.getItem('genesis_printer_ip') || '192.168.150.76';
  const s = document.createElement('script');
  s.src = 'http://' + ip + '/epos-2.27.0.js';
  s.onerror = function(){
    // プリンターからの読み込み失敗 → リポジトリのepos-2.27.0.jsを試行
    const s2 = document.createElement('script');
    s2.src = 'epos-2.27.0.js';
    s2.onerror = function(){ window._eposFailed = true; };
    document.head.appendChild(s2);
  };
  document.head.appendChild(s);
})();