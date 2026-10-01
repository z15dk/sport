/* Matchly – ligatabel til din hjemmeside. Kode og valg: https://matchly.dk/widget */
;(function () {
  var script = document.currentScript
  var origin = script && script.src ? new URL(script.src).origin : 'https://matchly.dk'
  var n = 0
  function mount(box) {
    if (box.getAttribute('data-matchly-ready')) return
    box.setAttribute('data-matchly-ready', '1')
    // The league table (data-liga) or a club's next matches (data-klub)
    var liga = box.getAttribute('data-liga')
    var klub = box.getAttribute('data-klub')
    if (!liga && !klub) return
    var id = 'm' + ++n + Math.random().toString(36).slice(2, 7)
    var q = new URLSearchParams({ id: id })
    ;['hold', 'farve', 'tema', 'kompakt', 'antal', 'seneste', 'tv', 'kort'].forEach(function (k) {
      var v = box.getAttribute('data-' + k)
      if (v) q.set(k, v)
    })
    // Which page it sits on, and whether the link back to us is still there (counted on /admin/widget)
    q.set('side', location.href.split('#')[0].slice(0, 300))
    var host = new URL(origin).hostname.replace(/^www\./, '')
    var links = box.querySelectorAll('a[href]')
    var linked = false
    for (var j = 0; j < links.length; j++) if (links[j].hostname.replace(/^www\./, '') === host) linked = true
    q.set('link', linked ? '1' : '0')
    var frame = document.createElement('iframe')
    // A league's round as cards: data-visning="runde" with data-liga
    var runde = box.getAttribute('data-visning') === 'runde' && liga
    frame.src = origin + (runde ? '/widget/runde/' + encodeURIComponent(liga) : klub ? '/widget/kampe/' + encodeURIComponent(klub) : '/widget/tabel/' + encodeURIComponent(liga)) + '?' + q
    frame.title = runde ? 'Rundens kampe fra Matchly' : klub ? 'Kommende kampe fra Matchly' : 'Ligatabel fra Matchly'
    frame.loading = 'lazy'
    frame.setAttribute('scrolling', 'no')
    frame.style.cssText = 'display:block;width:100%;height:560px;border:0;overflow:hidden;color-scheme:normal'
    frame.setAttribute('data-matchly-id', id)
    box.insertBefore(frame, box.firstChild)
  }
  addEventListener('message', function (e) {
    if (e.origin !== origin || !e.data || !e.data.matchly) return
    var frame = document.querySelector('iframe[data-matchly-id="' + e.data.matchly + '"]')
    if (frame && e.data.height) frame.style.height = Math.ceil(e.data.height) + 'px'
  })
  function all() {
    var boxes = document.querySelectorAll('.matchly-tabel, .matchly-kampe')
    for (var i = 0; i < boxes.length; i++) mount(boxes[i])
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', all)
  else all()
})()
