// Pixel-art icons drawn as tiny grids. Each character is one pixel:
// '.' = empty, other letters map to a colour in the palette ('X' = current text colour).
const Sprites = (() => {
  const P = {
    K: '#2b2118', W: '#ffffff', B: '#2f6fd6', b: '#7fb2f5', R: '#e0483e', r: '#f59a8f', G: '#2e8b57',
    g: '#7cd18f', Y: '#f5c542', y: '#fbe79a', N: '#8a5a2b', n: '#c08a52', S: '#8d96a3', s: '#c9d0d8',
    T: '#1f9e9a', O: '#f08a24', P: '#8e5bd6', X: 'currentColor',
  };

  const ICONS = {
    // ---- Map facilities (12x12) ----
    parking: [
      'KKKKKKKKKKKK', 'KBBBBBBBBBBK', 'KBBWWWWWBBBK', 'KBBWWBBWWBBK', 'KBBWWBBWWBBK', 'KBBWWWWWBBBK',
      'KBBWWBBBBBBK', 'KBBWWBBBBBBK', 'KBBWWBBBBBBK', 'KBBBBBBBBBBK', 'KbbbbbbbbbbK', 'KKKKKKKKKKKK'],
    toilet: [
      'KKKKKKKKKKKK', 'KTTTTTTTTTTK', 'KTWWTTTTWWTK', 'KTWWTTTTWWTK', 'KTTTTTTTTTTK', 'KWWWWTTTWWTK',
      'KWWWWTTWWWWK', 'KTWWTTTWWWWK', 'KTWWTTWWWWWK', 'KTWTWTTTWTWK', 'KTWTWTTTWTWK', 'KKKKKKKKKKKK'],
    surau: [
      '.....YY.....', '....Y.......', '....Y.......', '.....YY.....', '.....GG.....', '...GGGGGG...',
      '..GGGGGGGG..', '..GGgGGgGG..', 'KKKKKKKKKKKK', 'KWWWWKKWWWWK', 'KWWWWKKWWWWK', 'KKKKKKKKKKKK'],
    registration: [
      '....KKKK....', '.KKKSssSKKK.', '.KnnKKKKnnK.', '.KnWWWWWWnK.', '.KnWKKKKWnK.', '.KnWWWWWWnK.',
      '.KnWKKKWWnK.', '.KnWWWWWWnK.', '.KnWKKKKWnK.', '.KnWWWWWWnK.', '.KnnnnnnnnK.', '.KKKKKKKKKK.'],
    entrance: [
      'KKKKKKKKKKKK', 'KRRRRRRRRRRK', 'KKKKKKKKKKKK', 'KNK......KNK', 'KNK..WW..KNK', 'KNK.WWWW.KNK',
      'KNKWWWWWWKNK', 'KNK..WW..KNK', 'KNK..WW..KNK', 'KNK..WW..KNK', 'KNK......KNK', 'KKK......KKK'],
    water: [
      '.....KK.....', '....KbbK....', '....KbbK....', '...KbBBbK...', '...KbBBBK...', '..KbBBBBBK..',
      '..KbBBBBBK..', '.KbWBBBBBBK.', '.KbWBBBBBBK.', '.KbBBBBBBBK.', '..KBBBBBBK..', '...KKKKKK...'],
    trash: [
      '....KKKK....', 'KKKKKKKKKKKK', 'KSSSSSSSSSSK', 'KKKKKKKKKKKK', '.KsSsSsSsSK.', '.KsSsSsSsSK.',
      '.KsSsSsSsSK.', '.KsSsSsSsSK.', '.KsSsSsSsSK.', '.KsSsSsSsSK.', '.KsSsSsSsSK.', '.KKKKKKKKKK.'],
    food: [
      '...W..W..W..', '..W..W..W...', '...W..W..W..', '..W..W..W...', '............', 'KKKKKKKKKKKK',
      'KYYYYYYYYYYK', 'KOOyOOyOOOOK', '.KOOOOOOOOK.', '..KOOOOOOK..', '...KKKKKK...', '..KKKKKKKK..'],
    stage: [
      '.....KK.....', '....KYYK....', 'KKKKKYYKKKKK', 'KYYYYYYYYYYK', '.KYYYYYYYYK.', '..KYYYYYYK..',
      '..KYYYYYYK..', '.KYYYKKYYYK.', '.KYYK..KYYK.', 'KYYK....KYYK', 'KKK......KKK', '............'],
    firstaid: [
      'KKKKKKKKKKKK', 'KWWWWWWWWWWK', 'KWWWWRRWWWWK', 'KWWWWRRWWWWK', 'KWWWWRRWWWWK', 'KWRRRRRRRRWK',
      'KWRRRRRRRRWK', 'KWWWWRRWWWWK', 'KWWWWRRWWWWK', 'KWWWWRRWWWWK', 'KWWWWWWWWWWK', 'KKKKKKKKKKKK'],
    loading: [
      '............', 'KKKKKKKK....', 'KnnnnnnK....', 'KnNNNNnKKKK.', 'KnnnnnnKbbKK', 'KnNNNNnKbbbK',
      'KnnnnnnKKKKK', 'KKKKKKKKKKKK', 'KSSSSSSSSSSK', 'KKSSKKKKSSKK', '.KKKK..KKKK.', '..KK....KK..'],
    info: [
      '..KKKKKKKK..', '.KBBBBBBBBK.', 'KBBBBWWBBBBK', 'KBBBBWWBBBBK', 'KBBBBBBBBBBK', 'KBBBWWWBBBBK',
      'KBBBBWWBBBBK', 'KBBBBWWBBBBK', 'KBBBBWWBBBBK', 'KBBBWWWWBBBK', '.KBBBBBBBBK.', '..KKKKKKKK..'],

    // ---- Menu icons (9x9, drawn in the current text colour) ----
    nav_map: ['XXX.XXX..', 'X.XXX.XXX', 'X..X..X.X', 'X..X..X.X', 'X..X..X.X', 'X..X..X.X',
      'X..X..X.X', 'XXX.XXX.X', '..X...XXX'],
    nav_calendar: ['.X.....X.', 'XXXXXXXXX', 'X.......X', 'XXXXXXXXX', 'X.X.X.X.X', 'X.......X',
      'X.X.X.X.X', 'X.......X', 'XXXXXXXXX'],
    nav_edit: ['......XX.', '.....X.XX', '....X.XX.', '...X.XX..', '..X.XX...', '.X.XX....',
      'XX.X.....', 'XXX......', 'XXXXXXXXX'],
    nav_inbox: ['XXXXXXXXX', 'X.......X', 'X.......X', 'X.......X', 'XXXX.XXXX', 'X..X.X..X',
      'X...X...X', 'X.......X', 'XXXXXXXXX'],
    nav_users: ['..XX.....', '.XXXX.XX.', '.XXXXXXXX', '..XX.XXXX', '.......XX', 'XXXXXX...',
      'XXXXXXXXX', 'XXXXXXXXX', 'XXXXXXXXX'],
    nav_helper: ['.......XX', '.XXXXXXX.', '.XXXXXXX.', '.XXXXXXX.', '.XXXXXXX.', '.XXXXXXX.',
      'XXXXXXXXX', '.........', '.XX...XX.'],
    nav_chart: ['X........', 'X......XX', 'X......XX', 'X...XX.XX', 'X...XX.XX', 'X.XXXX.XX',
      'X.XXXX.XX', 'X.XXXX.XX', 'XXXXXXXXX'],
    nav_user: ['...XXX...', '..XXXXX..', '..XXXXX..', '..XXXXX..', '...XXX...', '.........',
      '.XXXXXXX.', 'XXXXXXXXX', 'XXXXXXXXX'],
    nav_list: ['XX.XXXXXX', 'XX.XXXXXX', '.........', 'XX.XXXXXX', 'XX.XXXXXX', '.........',
      'XX.XXXXXX', 'XX.XXXXXX', '.........'],
    nav_star: ['....X....', '....X....', '...XXX...', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..',
      '..XXXXX..', '.XX...XX.', 'XX.....XX'],
    nav_logout: ['XXXXX....', 'X...X....', 'X...X..X.', 'X...XXXXX', 'X...XXXXX', 'X...X..X.',
      'X...X....', 'X...X....', 'XXXXX....'],
    nav_store: ['XXXXXXXXX', 'X.X.X.X.X', 'XXXXXXXXX', '.X.....X.', '.X.XXX.X.', '.X.X.X.X.',
      '.X.X.X.X.', '.X.X.X.X.', 'XXXXXXXXX'],
  };

  // Converts a grid into an SVG string (one <rect> per run of same-coloured pixels).
  function svg(name, cls = '') {
    const rows = ICONS[name];
    if (!rows) return '';
    const w = rows[0].length;
    const h = rows.length;
    let rects = '';
    rows.forEach((row, y) => {
      let x = 0;
      while (x < w) {
        const ch = row[x];
        if (ch === '.') { x += 1; continue; }
        let run = 1;
        while (x + run < w && row[x + run] === ch) run += 1;
        rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${P[ch] || '#000'}"/>`;
        x += run;
      }
    });
    return `<svg class="sprite ${cls}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
  }

  return { svg, names: Object.keys(ICONS) };
})();

// Facility types the organizer can place on the map.
const FACILITY_TYPES = [
  { type: 'parking', label: 'Parking' }, { type: 'registration', label: 'Registration' },
  { type: 'entrance', label: 'Entrance' }, { type: 'toilet', label: 'Toilet' },
  { type: 'surau', label: 'Surau' }, { type: 'water', label: 'Water' },
  { type: 'trash', label: 'Bins' }, { type: 'food', label: 'Food Court' },
  { type: 'stage', label: 'Stage' }, { type: 'firstaid', label: 'First Aid' },
  { type: 'loading', label: 'Loading Bay' }, { type: 'info', label: 'Info' },
];
