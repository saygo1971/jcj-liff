/* jcj_liff.js
 * JOURNEY PASSPORT の画面が、LINEの中でも、外のブラウザでも同じように動くようにするための
 * 共通のファイルです。48枚のHTMLが、このファイルを1行 読み込みます。
 *
 * 作成 2026-11-23 ／ JCJ事業部 ／ 段1
 * 元になる設計 = JCJ事業部/docs/2026-11-26_途中で無理が出る所_設計.md
 *
 * ──────────────────────────────────────────────────────────────
 * このファイルが引き受ける仕事 3つ
 *
 *  1. LINEのSDK（https://static.line-scdn.net/liff/edge/2/sdk.js）の読み込み。
 *     ★読めなかったときの受け止めを持ちます。
 *       いままでは <script src="...sdk.js"></script> を直に書いていたため、
 *       読めないと liff が無い状態で liff.init() が呼ばれ、画面には何も出ませんでした。
 *
 *  2. 入り方（liff.init / liff.isLoggedIn / liff.login / liff.getProfile）を
 *     JCJ.init() と JCJ.profile() の2つにまとめます。
 *
 *  3. 画面の閉じ方・外のページの開き方・LINEへ送る操作を、
 *     LINEの中と外で分けます（JCJ.closeWindow / JCJ.openWindow / JCJ.sendMessages …）。
 *
 * ──────────────────────────────────────────────────────────────
 * 状態は3つです。JCJ.mode() で読めます
 *
 *   "line"  … LINEアプリの中で開かれている（SDKが読めて、ログイン済み）
 *   "web"   … 外のブラウザで開かれている（SDKが読めて、ログイン済み）
 *   "nosdk" … SDKが読めなかった
 *             ⇒ お客さまの番号は取れません。画面は出します（白い画面にしません）
 *
 * ★"line" と "web" では、いままでと1つも動きが変わりません。
 *   変わるのは "nosdk" のときだけで、いままでは白い画面でした。
 */
(function () {
  "use strict";

  var SDK_URL = "https://static.line-scdn.net/liff/edge/2/sdk.js";

  /* SDKの読み込みを何秒まで待つか。
     ここを過ぎたら "nosdk" として、画面ごとの文を出します。

     ★なぜ待ち時間が要るか
       届かない宛先なら onerror がすぐ返るので、待ち時間は要りません。
       要るのは「つながったのに返事が返ってこない」回線です
       （Citizen Lab が中国本土で見た形）。この場合 onerror は返らず、
       待ち時間が無いと、画面は いつまでも「読み込んでいます…」のままになります。

     ★なぜ20秒か
       短くすると、遅いけれど つながる回線の方が、
       いままで入れていたのに入れなくなります（新しい困りごとを作ります）。
       この画面たちが すでに使っている待ち時間が 15秒・20秒なので
       （例 checkin_here.html の場所を聞く所＝timeout:15000、
         geo_compare.html＝timeout:20000）、それに合わせて20秒にしました。
     ★回線の速さを測って決めた数では在りません。 */
  var SDK_TIMEOUT_MS = 20000;

  /* SDKが読めなかったときに、JCJ.init() が投げるエラーの文です。
     ★画面ごとの catch が、いままで通り その画面の文を出します。
       この文が お客さまの目に入るのは、エラーの文をそのまま出す画面
       （checkin.html 1526行目 "エラー: " + err.message）だけです。
       いままで そこに出ていたのは「liff is not defined」でした。 */
  var NOSDK_TEXT = "いまこの画面を開けませんでした。通信の状態をご確認のうえ、もう一度お試しください。";

  /* ★2026-11-24 オーナーさまのご決定②＝SDKの返事が返らないとき、
     5秒 過ぎたら「読み込んでいます…」等の【下に1行】出します。
     20秒たつと その画面の catch が NOSDK_TEXT を出すので、この1行は消します。 */
  var SLOW_MS   = 5000;
  var SLOW_TEXT = "通信に時間がかかっています。そのままお待ちください。";
  var SLOW_ID   = "__jcj_slow__";

  /* その画面の「読み込んでいます…」を出している所の すぐ下に1行 入れます。
     どの所かは、画面が JCJ.init(LIFF_ID, { slowAnchor: "status" }) で渡します。
     渡されていない画面には、1行も出しません（＝いままでと同じ）。 */
  function showSlow(anchorId) {
    try {
      if (document.getElementById(SLOW_ID)) return;
      var d = document.createElement("div");
      d.id = SLOW_ID;
      d.textContent = SLOW_TEXT;
      d.setAttribute("style",
        "margin-top:8px;font-size:15px;line-height:2.0;letter-spacing:.04em;color:#1A1A1A;");
      var a = anchorId ? document.getElementById(anchorId) : null;
      if (a && a.parentNode) a.parentNode.insertBefore(d, a.nextSibling);
      else if (document.body) document.body.appendChild(d);
    } catch (e) {}
  }
  function hideSlow() {
    try {
      var d = document.getElementById(SLOW_ID);
      if (d && d.parentNode) d.parentNode.removeChild(d);
    } catch (e) {}
  }

  /* ★2026-11-24 オーナーさまのご決定①＝SDKの置き場に届かなかったときだけ
     「エラー: 」の3文字を付けません。ほかの原因のエラーでは いままでどおり付けます。
     使う所＝その画面の main().catch(...)。 */
  function errText(err) {
    var m = (err && err.message) || String(err);
    if (err && err._jcjNoSdk) return m;
    return "エラー: " + m;
  }

  var _mode = "";          // "line" / "web" / "nosdk"
  var _profile = null;     // { userId, displayName, pictureUrl, statusMessage }
  var _sdkLoaded = false;  // SDKが読めたか
  var _initDone = null;    // JCJ.init() の約束。2度 呼ばれても1度しか走らせません

  /* ---------------------------------------------------------------
     SDKを読み込む。読めたら true、読めなければ false を返します。
     ★読めなかったときに throw しません（throw すると呼ぶ側が止まります）
     --------------------------------------------------------------- */
  function loadSdk() {
    return new Promise(function (resolve) {
      if (isRealSdk()) {
        _sdkLoaded = true;
        resolve(true);
        return;
      }
      var done = false;
      var finish = function (ok) {
        if (done) return;
        done = true;
        _sdkLoaded = ok;
        resolve(ok);
      };
      var s = document.createElement("script");
      s.src = SDK_URL;
      s.async = true;
      s.onload = function () { finish(isRealSdk()); };
      s.onerror = function () { finish(false); };
      /* 返事が返らないまま止まっている回線のための待ち時間です。
         ★8秒を過ぎたあとにSDKが届いた場合は、下の onload が
           _sdkLoaded を true に上げ直すので、画面の閉じ方などは
           あとからでも本来の動きになります。 */
      setTimeout(function () { finish(false); }, SDK_TIMEOUT_MS);
      document.head.appendChild(s);
    });
  }

  /* SDKが読めなかったときの window.liff。
     残っている liff.xxx の呼び出しが、throw せずに済むようにします。
     ★ログインはできません。userId は空のままです。 */
  /* いまの window.liff が、LINEが用意した本物かどうか。
     下の installFallbackLiff() が置いたものには _jcjFallback の印が付いています。
     ★LINEのSDKは window.liff へ無条件に入り直すので、本物が読めたら置き替わります。 */
  function isRealSdk() {
    return !!(window.liff && typeof window.liff.init === "function" && !window.liff._jcjFallback);
  }

  function installFallbackLiff() {
    if (isRealSdk()) return;
    window.liff = {
      _jcjFallback: true,
      init: function () { return Promise.resolve(); },
      ready: Promise.resolve(),
      isLoggedIn: function () { return false; },
      login: function () { /* 行き先が在りません。何もしません */ },
      logout: function () { },
      getProfile: function () {
        return Promise.resolve({ userId: "", displayName: "", pictureUrl: "", statusMessage: "" });
      },
      getAccessToken: function () { return null; },
      getIDToken: function () { return null; },
      getDecodedIDToken: function () { return null; },
      getContext: function () { return null; },
      getOS: function () { return "web"; },
      getLineVersion: function () { return null; },
      getLanguage: function () {
        return (navigator.language || "ja").toLowerCase();
      },
      getVersion: function () { return ""; },
      isInClient: function () { return false; },
      isApiAvailable: function () { return false; },
      openWindow: function (p) {
        try { window.open((p && p.url) || "", "_blank"); } catch (e) { }
      },
      closeWindow: function () { closeWindow(); },
      sendMessages: function () { return Promise.resolve(); },
      shareTargetPicker: function () { return Promise.resolve(null); },
      scanCodeV2: function () { return Promise.resolve({ value: null }); },
      getFriendship: function () { return Promise.resolve({ friendFlag: false }); },
      permission: {
        query: function () { return Promise.resolve({ state: "unavailable" }); },
        requestAll: function () { return Promise.resolve(); },
        getGrantedAll: function () { return Promise.resolve({ permissions: [] }); }
      },
      permanentLink: {
        createUrl: function () { return Promise.resolve(location.href); },
        createUrlBy: function (u) { return Promise.resolve(u || location.href); },
        setExtraQueryParam: function () { }
      }
    };
  }

  /* ---------------------------------------------------------------
     入り方の4つ ― いままでの4行を、1行ずつ そのまま置き替えます
       ★形を組み替えません。間に在る画面ごとの行は、そのまま残ります

       いままで                              これから
       ───────────────────────────────────────────────────────────
       await liff.init({ liffId: X });   →  await JCJ.init(X);
       liff.isLoggedIn()                →  JCJ.isLoggedIn()
       liff.login({ redirectUri: … })   →  JCJ.login({ redirectUri: … })
       await liff.getProfile()          →  await JCJ.profile()

     SDKが読めなかったとき（"nosdk"）の動き
       JCJ.init     … エラーを投げます。文は NOSDK_TEXT（上）です。
                       ⇒ 24枚とも、いままで通り その画面の catch が受け止めて、
                         その画面の文を出します（お客さまに出る文は変わりません）
       JCJ.isLoggedIn … false
       JCJ.login    … 行き先が在りません。何もしません
       JCJ.profile  … userId が空の中身を返します（throw しません）
     --------------------------------------------------------------- */
  function init(liffId, opts) {
    if (_initDone) return _initDone;
    var slowT = setTimeout(function () {
      if (!isRealSdk()) showSlow(opts && opts.slowAnchor);
    }, SLOW_MS);
    _initDone = loadSdk().then(function (ok) {
      clearTimeout(slowT);
      hideSlow();
      if (!ok) {
        _mode = "nosdk";
        installFallbackLiff();
        /* ★ここで投げます。
           理由＝24枚とも、いままで liff が無いときに投げられたエラーを
           自分の catch で受け止めて、その画面の文を出していました
           （実測 2026-11-23・24枚とも文が出ました。白い画面は0枚）。
           投げずに先へ進ませると、その画面の「読み込んでいます…」が
           回り続けたままになり、別の間違った文（例「はじめに登録が必要です」）が
           出ることが在ります。 */
        var e = new Error(NOSDK_TEXT);
        e._jcjNoSdk = true;   /* ★この印が付いたエラーだけ「エラー: 」を付けません */
        throw e;
      }
      return window.liff.init({ liffId: liffId }).then(function () {
        _mode = inClient() ? "line" : "web";
      }, function (e) {
        hideSlow();
        throw e;
      });
      /* ★liff.init が失敗したときは、いままでと同じように throw します。
         画面ごとの catch が、いままでと同じ文を出せるようにするためです。 */
    });
    return _initDone;
  }

  /* JCJ.isLoggedIn() … いままでの liff.isLoggedIn() と同じです。
     SDKが読めなかったときは false を返します（throw しません）。 */
  function isLoggedIn() {
    try {
      if (_sdkLoaded && window.liff.isLoggedIn) return !!window.liff.isLoggedIn();
    } catch (e) { }
    return false;
  }

  /* JCJ.login(opts) … いままでの liff.login() と同じです。
     SDKが読めなかったときは、行き先が在りません。何もしません。 */
  function login(opts) {
    try {
      if (_sdkLoaded && window.liff.login) {
        if (opts) window.liff.login(opts);
        else window.liff.login();
      }
    } catch (e) { }
  }

  /* JCJ.profile() … いままでの liff.getProfile() と同じです。
     ★SDKが読めなかったときは、空の中身を返します（throw しません）。 */
  function profile() {
    if (_profile) return Promise.resolve(_profile);
    if (!_sdkLoaded) {
      return Promise.resolve({ userId: "", displayName: "", pictureUrl: "", statusMessage: "" });
    }
    return window.liff.getProfile().then(function (p) {
      _profile = p || null;
      return p || { userId: "", displayName: "", pictureUrl: "", statusMessage: "" };
    });
  }

  function inClient() {
    try {
      return !!(window.liff && window.liff.isInClient && window.liff.isInClient());
    } catch (e) { return false; }
  }

  /* ---------------------------------------------------------------
     JCJ.openWindow(url, external)
       LINEの中 … liff.openWindow（いままでと同じ）
       外       … window.open
     --------------------------------------------------------------- */
  function openWindow(url, external) {
    if (!url) return;
    try {
      if (_sdkLoaded && inClient() && window.liff.openWindow) {
        window.liff.openWindow({ url: url, external: external === true });
        return;
      }
    } catch (e) { }
    try {
      var w = window.open(url, "_blank");
      if (!w) location.href = url;   /* 新しいタブを止められたとき */
    } catch (e) { location.href = url; }
  }

  /* ---------------------------------------------------------------
     JCJ.closeWindow()
       LINEの中 … liff.closeWindow（いままでと同じ）
       外       … 1つ前の画面へ戻る。戻る先が無いときは、その場に留まります
                  ★外のブラウザでは window.close() が効きません
                    （そのページが開いたタブではないため）
     --------------------------------------------------------------- */
  function closeWindow() {
    try {
      if (_sdkLoaded && inClient() && window.liff.closeWindow) {
        window.liff.closeWindow();
        return;
      }
    } catch (e) { }
    try {
      if (history.length > 1) { history.back(); return; }
      window.close();   /* 効かないことが在ります。そのときは何も起きません */
    } catch (e) { }
  }

  /* ---------------------------------------------------------------
     JCJ.sendMessages(messages)
       LINEの中 … liff.sendMessages（いままでと同じ）
       外       … 送れません。false を返します
                  ★呼ぶ側が「送れたか」で分かれる作りのため、throw しません
     --------------------------------------------------------------- */
  function sendMessages(messages) {
    try {
      if (_sdkLoaded && inClient() && window.liff.sendMessages) {
        return window.liff.sendMessages(messages).then(function () { return true; });
      }
    } catch (e) { }
    return Promise.resolve(false);
  }

  /* ---------------------------------------------------------------
     JCJ.shareTargetPicker(messages)
       LINEの中で使える場合 … liff.shareTargetPicker（いままでと同じ）
       それ以外             … null を返します
     --------------------------------------------------------------- */
  function shareTargetPicker(messages) {
    try {
      if (_sdkLoaded && window.liff.shareTargetPicker &&
          window.liff.isApiAvailable && window.liff.isApiAvailable("shareTargetPicker")) {
        return window.liff.shareTargetPicker(messages);
      }
    } catch (e) { }
    return Promise.resolve(null);
  }

  /* JCJ.lineVersion() … LINEの中でないときは null */
  function lineVersion() {
    try {
      if (_sdkLoaded && window.liff.getLineVersion) return window.liff.getLineVersion();
    } catch (e) { }
    return null;
  }

  /* JCJ.isApiAvailable(name) … LINEの中でないときは false */
  function isApiAvailable(name) {
    try {
      if (_sdkLoaded && window.liff.isApiAvailable) return !!window.liff.isApiAvailable(name);
    } catch (e) { }
    return false;
  }

  /* JCJ.scanCodeV2() … LINEの中で使えるときだけ。
     ★使えないときは「断る」形で返します（resolve しません）。
       理由＝画面の側は catch の中で
       「この端末では、アプリの中でQRを読めませんでした。…」を出す作りで、
       null を返すと「読み取れませんでした。もう一度 お試しください。」という
       別の文が出てしまうためです（いままでと同じ文を出すため）。 */
  function scanCodeV2() {
    try {
      if (_sdkLoaded && window.liff.scanCodeV2 &&
          window.liff.isApiAvailable && window.liff.isApiAvailable("scanCodeV2")) {
        return window.liff.scanCodeV2();
      }
    } catch (e) { }
    return Promise.reject(new Error("no_scan"));
  }

  /* JCJ.getFriendship() … LINEの中でないときは friendFlag:false */
  function getFriendship() {
    try {
      if (_sdkLoaded && window.liff.getFriendship) return window.liff.getFriendship();
    } catch (e) { }
    return Promise.resolve({ friendFlag: false });
  }

  /* ★このファイルを読み込んだ時点で window.liff を置きます。
     理由＝画面の中には liff.isInClient() を守りなしで呼ぶ所が在り（48枚で68か所）、
     SDKがまだ届いていない間に呼ばれると、そこで画面が止まるためです。
     本物のSDKが届いた時点で、LINEのSDKがこれを置き替えます（window.liff へ無条件に入ります）。 */
  installFallbackLiff();

  window.JCJ = {
    init: init,
    isLoggedIn: isLoggedIn,
    login: login,
    profile: profile,
    mode: function () { return _mode; },
    sdkLoaded: function () { return _sdkLoaded; },
    isInClient: inClient,
    openWindow: openWindow,
    closeWindow: closeWindow,
    sendMessages: sendMessages,
    shareTargetPicker: shareTargetPicker,
    lineVersion: lineVersion,
    isApiAvailable: isApiAvailable,
    scanCodeV2: scanCodeV2,
    getFriendship: getFriendship,
    errText: errText,
    SDK_URL: SDK_URL,
    NOSDK_TEXT: NOSDK_TEXT,
    SLOW_TEXT: SLOW_TEXT,
    SLOW_MS: SLOW_MS
  };
})();
