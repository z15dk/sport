/* Matchly – helsidesannonce til din side. Kode: https://matchly.dk/admin/annonce. Fylder hele skærmens bredde; data-bredde="kolonne" holder den i kolonnen. */
;(function () {
  var script = document.currentScript
  var origin = script && script.src ? new URL(script.src).origin : 'https://matchly.dk'
  var n = 0
  var frames = []
  function wanted(box) {
    // A whole screen ("helside"), unless the code names a height (data-hoejde="700")
    var fixed = parseInt(box.getAttribute('data-hoejde') || '', 10)
    if (fixed > 0) return Math.max(200, Math.min(2000, fixed))
    // The banner for the top of a page is 300 px
    if (box.getAttribute('data-format') === 'banner') return 300
    var h = window.innerHeight || document.documentElement.clientHeight || 800
    return Math.max(480, Math.min(1100, h - 24))
  }
  // Whether the ad may spread across the whole screen: not from inside something that clips
  // its content to a narrower width (a scrolling column, a card with overflow hidden)
  function mayBleed(box) {
    if (box.getAttribute('data-bredde') === 'kolonne') return false
    var wide = document.documentElement.clientWidth
    for (var el = box.parentElement; el && el !== document.body; el = el.parentElement) {
      var cs = getComputedStyle(el)
      if ((cs.overflowX !== 'visible' || cs.overflow !== 'visible') && el.clientWidth < wide - 2) return false
      if (cs.transform !== 'none' || cs.position === 'fixed') return false
    }
    return true
  }
  function size(entry) {
    var frame = entry.frame
    // A whole page ("helside"): from the screen's left edge to its right, also when the code sits in a narrow column
    if (mayBleed(entry.box)) {
      frame.style.width = '100%'
      frame.style.marginLeft = '0'
      var left = entry.box.getBoundingClientRect().left
      var wide = document.documentElement.clientWidth
      frame.style.width = wide + 'px'
      frame.style.marginLeft = -left + 'px'
      frame.style.maxWidth = 'none'
    } else {
      frame.style.width = '100%'
      frame.style.marginLeft = '0'
    }
    var h = Math.max(wanted(entry.box), entry.need || 0)
    frame.style.height = Math.ceil(h) + 'px'
  }
  function mount(box) {
    if (box.getAttribute('data-matchly-ready')) return
    box.setAttribute('data-matchly-ready', '1')
    var id = 'a' + ++n + Math.random().toString(36).slice(2, 7)
    var q = new URLSearchParams({ id: id })
    var campaign = box.getAttribute('data-kampagne')
    if (campaign) q.set('kampagne', campaign)
    if (box.getAttribute('data-format') === 'banner') q.set('format', 'banner')
    // Which page the ad sits on (counted with the clicks on /admin/annonce)
    q.set('side', location.href.split('#')[0].slice(0, 300))
    var frame = document.createElement('iframe')
    frame.src = origin + '/annonce/helside?' + q
    frame.title = 'Matchly – live score og stats (annonce)'
    frame.setAttribute('scrolling', 'no')
    frame.style.cssText = 'display:block;width:100%;max-width:none;height:600px;border:0;overflow:hidden;color-scheme:normal;border-radius:' + (box.getAttribute('data-hjoerner') || '0') + 'px'
    box.style.overflow = 'visible'
    frame.setAttribute('data-matchly-id', id)
    // The fallback link in the code is replaced by the ad itself
    while (box.firstChild) box.removeChild(box.firstChild)
    box.appendChild(frame)
    var entry = { box: box, frame: frame, id: id, need: 0 }
    frames.push(entry)
    size(entry)
  }
  addEventListener('message', function (e) {
    if (e.origin !== origin || !e.data || !e.data.matchlyAd) return
    for (var i = 0; i < frames.length; i++)
      if (frames[i].id === e.data.matchlyAd) {
        // The ad's own content needs at least this much (then it is taller than the screen rather than cut off)
        frames[i].need = e.data.need || 0
        size(frames[i])
      }
  })
  function all_size() {
    for (var i = 0; i < frames.length; i++) size(frames[i])
  }
  addEventListener('resize', all_size)
  addEventListener('load', all_size)
  setTimeout(all_size, 1000)
  function all() {
    var boxes = document.querySelectorAll('.matchly-annonce')
    for (var i = 0; i < boxes.length; i++) mount(boxes[i])
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', all)
  else all()
})()
