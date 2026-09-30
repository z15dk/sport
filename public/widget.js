/* Matchly – ligatabel til din hjemmeside. Kode og valg: https://matchly.dk/widget */
;(function () {
  var script = document.currentScript
  var origin = script && script.src ? new URL(script.src).origin : 'https://matchly.dk'
  var n = 0
  function mount(box) {
    if (box.getAttribute('data-matchly-ready')) return
    box.setAttribute('data-matchly-ready', '1')
    var liga = box.getAttribute('data-liga')
    if (!liga) return
    var id = 'm' + ++n + Math.random().toString(36).slice(2, 7)
    var q = new URLSearchParams({ id: id })
    ;['hold', 'tema', 'kompakt'].forEach(function (k) {
      var v = box.getAttribute('data-' + k)
      if (v) q.set(k, v)
    })
    var frame = document.createElement('iframe')
    frame.src = origin + '/widget/tabel/' + encodeURIComponent(liga) + '?' + q
    frame.title = 'Ligatabel fra Matchly'
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
    var boxes = document.querySelectorAll('.matchly-tabel')
    for (var i = 0; i < boxes.length; i++) mount(boxes[i])
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', all)
  else all()
})()
