import { calculate, captureModes, defaults } from './calculate.mjs';

const $ = id => document.getElementById(id);
const cards = [16, 32, 64, 128, 256, 512];
const photoOptions = ['2', '4', '8', '16', '32'].map(value => [value, value + ' MP']);
const videoOptions = ['SD', 'HD', 'QHD', '4K'].map(value => [value, value]);
const key = 'trail-camera-settings-v1';
let saved;
try { saved = JSON.parse(localStorage.getItem(key)); } catch { saved = null; }
let state = { ...defaults, ...saved?.settings };
let baseline = saved?.baseline ?? null;
const fields = new Map();
const number = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
const fmt = value => number.format(value);
const amount = (value, unit) => value > 0 && value < 0.005 ? '< 0.01 ' + unit : fmt(value) + ' ' + unit;
const storage = mb => mb >= 1000 ? amount(mb / 1000, 'GB') : amount(mb, 'MB');
const runtime = days => days === null ? 'No captures configured' : amount(days, 'days');
const buttons = [];

function persist() {
  try { localStorage.setItem(key, JSON.stringify({ settings: state, baseline })); } catch {}
}

function field(parent, name, title, config = {}) {
  const row = document.createElement('label');
  const isCheck = config.check;
  if (config.wide || isCheck) row.classList.add('field-wide');
  const control = document.createElement(config.options ? 'select' : 'input');
  control.id = name;
  if (config.options) {
    for (const [value, label] of config.options) control.append(new Option(label, value));
  } else if (isCheck) {
    control.type = 'checkbox';
    row.classList.add('check');
  } else {
    control.type = 'number';
    control.step = 'any';
    control.min = 0;
    if (config.max !== undefined) control.max = config.max;
  }
  const error = document.createElement('span');
  error.className = 'error';
  error.id = name + 'Error';
  error.hidden = true;
  control.setAttribute('aria-describedby', error.id);
  if (isCheck) row.append(control, title, error);
  else row.append(title, control, error);
  $(parent).append(row);
  fields.set(name, { control, config, row, error });
  control.addEventListener('input', () => {
    if (isCheck) state[name] = control.checked;
    else if (config.options) state[name] = config.numeric ? Number(control.value) : control.value;
    else state[name] = control.validity.badInput ? '?' : control.value === '' ? '' : control.valueAsNumber;
    update();
  });
}

for (const size of cards) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = size + ' GB';
  button.addEventListener('click', () => {
    state.capacity = size;
    $('capacity').value = size;
    update();
  });
  buttons.push([size, button]);
  $('presets').append(button);
}
field('cardFields', 'capacity', 'Card capacity (GB)', { positive: true });
field('cardFields', 'reserved', 'Reserved space (GB)', { blankZero: true });
field('cardFields', 'deployment', 'Deployment length (days, optional)', { optional: true, wide: true });
field('setupFields', 'setup', 'Recording mode', { wide: true, options: [
  ['motion', 'Motion trigger only'], ['lapse', 'Normal timelapse'], ['hybrid', 'Hybrid timelapse + motion trigger']
] });
field('setupFields', 'lapseUsesCaptureSettings', 'Use capture settings for each timelapse interval', { check: true });
field('motionFields', 'mode', 'Capture mode', { options: [
  ['photo', 'Photo'], ['video', 'Video'], ['both', 'Video + Photo']
] });
field('motionFields', 'hours', 'Motion monitoring hours per day', { max: 24 });
field('motionFields', 'linked', 'Use the same trigger rate for photos and videos', { check: true });
field('photoFields', 'photoRes', 'Photo resolution', { options: photoOptions });
field('photoFields', 'photoRate', 'Photo triggers per hour');
field('photoFields', 'burst', 'Photos per trigger', { numeric: true, options: [1, 3, 5].map(value => [value, value]) });
field('videoFields', 'videoRes', 'Video resolution', { options: videoOptions });
field('videoFields', 'videoRate', 'Video triggers per hour');
field('videoFields', 'videoSeconds', 'Video duration (seconds)', { positive: true });
field('lapseFields', 'interval', 'Capture interval', { positive: true });
field('lapseFields', 'unit', 'Interval unit', { options: [['seconds', 'Seconds'], ['minutes', 'Minutes']] });
field('lapseFields', 'lapseHours', 'Recording hours per day', { max: 24 });
for (const [value, label] of photoOptions) {
  field('photoSizes', 'photo' + value, label, { positive: true });
  $('samplePreset').append(new Option(label + ' photo', 'photo' + value));
}
for (const [value, label] of videoOptions) {
  field('videoSizes', 'video' + value, label, { positive: true });
  $('samplePreset').append(new Option(label + ' video', 'video' + value));
}

function syncFields() {
  for (const [name, { control, config }] of fields) {
    if (config.check) control.checked = state[name];
    else control.value = state[name] === '?' ? '' : state[name];
  }
}
function showField(name, show) {
  const { row, control } = fields.get(name);
  row.hidden = !show;
  control.disabled = !show;
}

function row(label, value) {
  return '<div class="data-row"><span>' + label + '</span><strong>' + value + '</strong></div>';
}
function renderForecast(r) {
  const segments = [['Timelapse photos', 'lapse'], ['Motion photos', 'photo'], ['Timelapse videos', 'lapse-video'], ['Motion videos', 'video']];
  const bar = segments.map(([, colour], i) => '<span class="' + colour + '" style="width:' +
    (r.daily ? 100 * (r.segments[i] / r.daily) : 0) + '%"></span>').join('');
  const legend = segments.map(([label, colour], i) => '<li><span class="dot ' + colour + '"></span>' +
    label + '<strong>' + storage(r.segments[i]) + '</strong></li>').join('');
  const assumptions = [];
  if (r.usesPhotos) assumptions.push(state.photoRes + ' MP at ' + amount(r.photoSize, 'MB/photo'));
  if (r.usesVideo) assumptions.push(state.videoRes + ' at ' + amount(r.videoSize, 'MB/min'));
  const countLabel = (value, approximate) => (approximate ? '≈ ' : '') + fmt(value);
  const metric = (label, value) => '<div class="metric"><strong>' + value + '</strong><span>' + label + '</span></div>';
  const atFull = (rate, days) => days === null ? '—' : '≈ ' + fmt(Math.floor(rate * days + 1e-9));
  $('resultContent').innerHTML =
    '<div class="runtime"><span>Storage-limited runtime</span><strong>' + runtime(r.days) +
    '</strong><span>Battery life is excluded.</span></div>' +
    (r.daily === 0 && r.days === 0 ? '<p class="note">No captures configured.</p>' : '') +
    '<div class="metrics">' + metric('Photos / day', countLabel(r.photos, r.fractionalPhotos)) +
    metric('Videos / day', countLabel(r.videos, r.fractionalVideos)) + metric('Storage / day', storage(r.daily)) + '</div>' +
    '<h3>Daily storage breakdown</h3><div class="bar" aria-hidden="true">' + bar + '</div><ul class="legend">' + legend + '</ul>' +
    row('Timelapse photos / day', fmt(r.lapsePhotos)) + row('Motion photos / day', countLabel(r.motionPhotos, r.fractionalPhotos)) +
    row('Timelapse videos / day', fmt(r.lapseVideos)) + row('Motion videos / day', countLabel(r.motionVideos, r.fractionalVideos)) +
    row('Estimated photos when full', atFull(r.photos, r.days)) + row('Estimated videos when full', atFull(r.videos, r.days)) +
    row('Available card space', storage(r.available)) +
    '<p class="note">Active estimates · ' + assumptions.join(' · ') + '</p>';
}

function renderDeployment(r) {
  $('deploymentPanel').hidden = r.deploymentMB === null;
  if (r.deploymentMB === null) return;
  const remaining = r.available - r.deploymentMB;
  const fits = remaining >= 0;
  $('deploymentResult').innerHTML = '<p class="status' + (fits ? '' : ' short') + '">' +
    (fits ? 'Fits' : 'Card fills before deployment ends') + '</p>' +
    row('Required for captures', storage(r.deploymentMB)) +
    row('Total card capacity required', storage(r.deploymentMB + state.reserved * 1000)) +
    row(fits ? 'Remaining space' : 'Shortfall', storage(Math.abs(remaining)));
}

function renderComparison(r) {
  $('saveBaseline').textContent = baseline ? 'Replace baseline' : 'Save as baseline';
  $('clearBaseline').hidden = !baseline;
  if (!baseline) {
    $('comparison').innerHTML = '<p class="note">Save your current setup, then change settings to see the effect.</p>';
    return;
  }
  const before = calculate(baseline);
  const delta = (value, previous, format) => value === null || previous === null
    ? '—' : (value > previous ? '+' : value < previous ? '−' : '') + format(Math.abs(value - previous));
  const comparison = [
    ['Photos / day', fmt(before.photos), r ? fmt(r.photos) : '—', '—'],
    ['Videos / day', fmt(before.videos), r ? fmt(r.videos) : '—', '—'],
    ['Storage / day', storage(before.daily), r ? storage(r.daily) : '—', r ? delta(r.daily, before.daily, storage) : '—'],
    ['Runtime', runtime(before.days), r ? runtime(r.days) : '—', r ? delta(r.days, before.days, runtime) : '—']
  ];
  $('comparison').innerHTML = '<table><thead><tr><th scope="col">Metric</th><th scope="col">Baseline</th><th scope="col">Current</th><th scope="col">Change</th></tr></thead><tbody>' +
    comparison.map(([label, ...values]) => '<tr><th scope="row">' + label + '</th>' +
      values.map(value => '<td>' + value + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
}

let current = null;
function update() {
  const { motion, lapse, usesCaptureSettings, motionPhoto, motionVideo, lapsePhoto, lapseVideo } = captureModes(state);
  const photo = motionPhoto || lapsePhoto;
  const video = motionVideo || lapseVideo;
  const linked = motion && state.mode === 'both' && state.linked;
  $('motionFields').hidden = !(motion || usesCaptureSettings);
  $('hybridNote').hidden = state.setup !== 'hybrid';
  $('photoPanel').hidden = !photo;
  $('videoPanel').hidden = !video;
  $('lapsePanel').hidden = !lapse;
  $('lapseNote').textContent = usesCaptureSettings
    ? 'Each interval uses the selected capture mode. Motion trigger rates apply only to motion events.'
    : 'One still per interval, starting when the window opens and excluding the endpoint.';
  showField('lapseUsesCaptureSettings', lapse);
  showField('mode', motion || usesCaptureSettings);
  showField('hours', motion);
  showField('linked', motion && state.mode === 'both');
  showField('photoRes', photo);
  showField('photoRate', motionPhoto);
  showField('burst', motionPhoto || (usesCaptureSettings && lapsePhoto));
  showField('videoRes', video);
  showField('videoRate', motionVideo);
  showField('videoSeconds', video);
  showField('interval', lapse);
  showField('unit', lapse);
  showField('lapseHours', lapse);
  $('videoRate').disabled = !motionVideo || linked;
  $('videoRate').value = linked ? $('photoRate').value : state.videoRate === '?' ? '' : state.videoRate;
  for (const [size, button] of buttons) button.setAttribute('aria-pressed', String(state.capacity === size));

  const input = { ...state, reserved: state.reserved === '' ? 0 : state.reserved };
  let valid = true;
  for (const [name, { control, config, error }] of fields) {
    let message = '';
    const value = input[name];
    if (!control.disabled && !config.options && !config.check && !(config.optional && value === '')) {
      if (!Number.isFinite(value)) message = 'Enter a number.';
      else if (config.positive && value <= 0) message = 'Enter a value greater than zero.';
      else if (value < 0) message = 'Enter zero or a positive value.';
      else if (config.max !== undefined && value > config.max) message = 'Maximum ' + config.max + '.';
      else if (name === 'reserved' && value > input.capacity) message = 'Reserved space exceeds card capacity.';
    }
    error.textContent = message;
    error.hidden = !message;
    control.setAttribute('aria-invalid', String(Boolean(message)));
    if (message) valid = false;
  }
  current = valid ? { input, result: calculate(input) } : null;
  const r = current?.result;
  if (r && [r.available, r.daily, r.days, r.deploymentMB].every(value => value === null || Number.isFinite(value))) {
    renderForecast(r);
    renderDeployment(r);
  } else {
    current = null;
    $('resultContent').textContent = valid ? 'Enter smaller values to calculate a forecast.' : 'Check the highlighted settings to update the forecast.';
    $('deploymentPanel').hidden = true;
  }
  $('saveBaseline').disabled = !current;
  $('savePreset').disabled = !current || !presetsReady || presetBusy;
  renderComparison(current?.result);
  persist();
}

function showSampleDuration() {
  const video = $('samplePreset').value.startsWith('video');
  $('durationLabel').hidden = !video;
  $('sampleDuration').disabled = !video;
  $('sampleDuration').required = video;
  $('calibrationStatus').textContent = '';
}
$('samplePreset').addEventListener('change', showSampleDuration);
$('calibration').addEventListener('submit', event => {
  event.preventDefault();
  const preset = $('samplePreset').value;
  const size = $('sampleSize').valueAsNumber;
  const duration = preset.startsWith('video') ? $('sampleDuration').valueAsNumber : 60;
  const calibrated = size / duration * 60;
  if (!Number.isFinite(calibrated) || calibrated <= 0 || duration <= 0) {
    $('calibrationStatus').textContent = 'Enter a positive file size and, for video, a positive duration.';
    return;
  }
  state[preset] = Number(calibrated.toPrecision(10));
  $(preset).value = state[preset];
  $('calibrationStatus').textContent = 'Preset updated to ' + amount(state[preset], preset.startsWith('video') ? 'MB/min.' : 'MB/photo.');
  update();
});
$('reset').addEventListener('click', () => {
  state = { ...defaults };
  baseline = null;
  $('calibration').reset();
  showSampleDuration();
  syncFields();
  update();
});
$('saveBaseline').addEventListener('click', () => {
  if (!current) return;
  baseline = { ...current.input };
  update();
});
$('clearBaseline').addEventListener('click', () => {
  baseline = null;
  update();
});
let presetsReady = false;
let presetBusy = false;
let namedPresets = [];
const selectedPresets = new Set();

async function presetRequest(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to access saved presets.');
  return data;
}

function renderNamedPresets() {
  const list = $('savedPresets');
  list.replaceChildren();
  if (!namedPresets.length) list.textContent = 'No saved presets yet.';
  for (const preset of namedPresets) {
    const item = document.createElement('div');
    item.className = 'saved-preset';
    const label = document.createElement('label');
    label.className = 'check';
    const select = document.createElement('input');
    select.type = 'checkbox';
    select.checked = selectedPresets.has(preset.id);
    select.setAttribute('aria-label', 'Compare ' + preset.name);
    select.addEventListener('change', () => {
      if (select.checked) selectedPresets.add(preset.id);
      else selectedPresets.delete(preset.id);
      renderPresetComparison();
    });
    label.append(select, document.createTextNode(preset.name));
    const load = document.createElement('button');
    load.type = 'button';
    load.className = 'quiet';
    load.textContent = 'Load';
    load.setAttribute('aria-label', 'Load ' + preset.name);
    load.addEventListener('click', () => {
      state = { ...preset.settings };
      syncFields();
      update();
      $('presetStatus').textContent = 'Loaded “' + preset.name + '”.';
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'quiet';
    remove.textContent = 'Delete';
    remove.setAttribute('aria-label', 'Delete ' + preset.name);
    remove.addEventListener('click', async () => {
      remove.disabled = true;
      try {
        await presetRequest('/api/presets/' + preset.id, { method: 'DELETE' });
        selectedPresets.delete(preset.id);
        namedPresets = namedPresets.filter(value => value.id !== preset.id);
        renderNamedPresets();
        $('presetStatus').textContent = 'Preset deleted.';
      } catch (error) {
        $('presetStatus').textContent = error.message;
        remove.disabled = false;
      }
    });
    item.append(label, load, remove);
    list.append(item);
  }
  renderPresetComparison();
}

function renderPresetComparison() {
  const container = $('presetComparison');
  container.replaceChildren();
  const selected = namedPresets.filter(preset => selectedPresets.has(preset.id));
  if (selected.length < 2) {
    container.textContent = 'Select at least two saved presets to compare.';
    return;
  }
  const forecasts = selected.map(preset => calculate(preset.settings));
  const table = document.createElement('table');
  const caption = table.createCaption();
  caption.textContent = 'Saved preset comparison';
  const header = table.createTHead().insertRow();
  for (const name of ['Daily forecast', ...selected.map(preset => preset.name)]) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = name;
    header.append(cell);
  }
  const body = table.createTBody();
  for (const [name, values] of [
    ['Photos / day', forecasts.map(r => fmt(r.photos))],
    ['Videos / day', forecasts.map(r => fmt(r.videos))],
    ['Storage / day', forecasts.map(r => storage(r.daily))],
    ['Storage-limited runtime', forecasts.map(r => runtime(r.days))]
  ]) {
    const row = body.insertRow();
    const heading = document.createElement('th');
    heading.scope = 'row';
    heading.textContent = name;
    row.append(heading);
    for (const value of values) row.insertCell().textContent = value;
  }
  container.append(table);
}

$('presetForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!current || !presetsReady || presetBusy) return;
  const name = $('presetName').value.trim();
  if (!name) { $('presetStatus').textContent = 'Enter a preset name.'; return; }
  presetBusy = true;
  update();
  try {
    const data = await presetRequest('/api/presets', {
      method: 'POST', body: JSON.stringify({ name, settings: current.input })
    });
    namedPresets.push(data.preset);
    renderNamedPresets();
    $('presetName').value = '';
    $('presetStatus').textContent = 'Preset saved.';
  } catch (error) {
    $('presetStatus').textContent = error.message;
  } finally {
    presetBusy = false;
    update();
  }
});

showSampleDuration();
syncFields();
update();
(async () => {
  try {
    const data = await presetRequest('/api/presets');
    namedPresets = data.presets;
    presetsReady = true;
    renderNamedPresets();
    update();
  } catch (error) {
    $('presetStatus').textContent = error.message + ' Reload to try again.';
  }
})();
