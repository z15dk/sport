/* Matchly – helsidesannonce til din side. Kode: https://matchly.dk/admin/annonce. Fylder hele skærmens bredde; data-bredde="kolonne" holder den i kolonnen. */
;(function () {
  var script = document.currentScript
  var origin = script && script.src ? new URL(script.src).origin : 'https://matchly.dk'
  var n = 0
  var frames = []
  function wanted(entry) {
    var box = entry.box
    // A whole screen ("helside"), unless the code names a height (data-hoejde="700")
    var fixed = parseInt(box.getAttribute('data-hoejde') || '', 10)
    if (fixed > 0) return Math.max(200, Math.min(2000, fixed))
    // The banner for the top of a page is 300 px
    if (box.getAttribute('data-format') === 'banner') return 300
    // The screen's height, kept while the phone's address bar comes and goes (it changes the height
    // a little at every scroll); taken again only when the width changes (turned) or the height a lot
    var h = window.innerHeight || document.documentElement.clientHeight || 800
    var w = document.documentElement.clientWidth
    if (!entry.screen || entry.screen.w !== w || Math.abs(entry.screen.h - h) > 160) entry.screen = { w: w, h: h }
    return Math.max(480, Math.min(1100, entry.screen.h - 24))
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
  // Sets a style only when it changes: every change makes the page lay itself out again
  function set(frame, key, value) {
    if (frame.style[key] !== value) frame.style[key] = value
  }
  function size(entry) {
    var frame = entry.frame
    // A whole page ("helside"): from the screen's left edge to its right, also when the code sits in a narrow column.
    // Measured on the box around the ad (the ad's own width and margin do not move it)
    if (mayBleed(entry.box)) {
      var left = Math.round(entry.box.getBoundingClientRect().left)
      set(frame, 'width', document.documentElement.clientWidth + 'px')
      set(frame, 'marginLeft', -left + 'px')
      set(frame, 'maxWidth', 'none')
    } else {
      set(frame, 'width', '100%')
      set(frame, 'marginLeft', '0px')
    }
    set(frame, 'height', Math.ceil(Math.max(wanted(entry), entry.need || 0)) + 'px')
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
        // The ad's own content needs at least this much (then it is taller than the screen rather than cut off);
        // nothing to do when it is what the ad already has
        var need = Math.ceil(e.data.need || 0)
        if (Math.abs(need - frames[i].need) < 2) continue
        frames[i].need = need
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
