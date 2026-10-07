// Whether two spellings of a name are the same person: same last name and first initial
// ("T. Jeppesen" is Tommy Jeppesen, "Hjalte Nørregaard" is Hjalte Bo Nørregaard). Pure (tests).

const plain = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zæøå ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export function samePerson(a: string, b: string) {
  const [x, y] = [plain(a).split(' '), plain(b).split(' ')]
  if (!x[0] || !y[0]) return false
  return x[x.length - 1] === y[y.length - 1] && x[0][0] === y[0][0]
}
