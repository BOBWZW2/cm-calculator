const root = document.getElementById('root');

const fmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function numberValue(id, fallback) {
  const el = document.getElementById(id);
  const value = Number(el && el.value);
  return Number.isFinite(value) ? value : fallback;
}

function render() {
  const oft = numberValue('oft', 1350);
  const surcharge = numberValue('surcharge', 420);
  const thc = numberValue('thc', 180);
  const feeder = numberValue('feeder', 230);
  const commission = numberValue('commission', 85);
  const container = numberValue('container', 70);
  const revenue = oft + surcharge;
  const cost = thc + feeder + commission + container;
  const cm = revenue - cost;
  const margin = revenue ? cm / revenue * 100 : 0;

  const cmNode = document.getElementById('cm-value');
  const marginNode = document.getElementById('margin-value');
  const revenueNode = document.getElementById('revenue-value');
  const costNode = document.getElementById('cost-value');
  if (cmNode) cmNode.textContent = fmt.format(cm);
  if (marginNode) marginNode.textContent = margin.toFixed(1) + '%';
  if (revenueNode) revenueNode.textContent = fmt.format(revenue);
  if (costNode) costNode.textContent = fmt.format(cost);
}

function mount() {
  root.innerHTML = `
    <main class="app-shell">
      <header class="hero-panel">
        <div>
          <p class="eyebrow">Contribution Margin Simulator</p>
          <h1>CM Calculator</h1>
          <p class="hero-copy">A hosted preview of the freight contribution margin workflow. The full local app includes Excel tariff import, SQLite persistence, manual maintenance, and backend API simulation.</p>
        </div>
        <div class="hero-stats">
          <div class="stat-card"><span>Mode</span><strong>GitHub preview</strong></div>
          <div class="stat-card"><span>Deployment</span><strong>Docker / Render ready</strong></div>
        </div>
      </header>

      <section class="tab-strip">
        <button class="tab-button active"><span>Simulation</span><small>Revenue, cost, and CM summary</small></button>
        <button class="tab-button"><span>Tariff data</span><small>Excel-backed in the full app</small></button>
        <button class="tab-button"><span>Manual rules</span><small>Seeded from manual-seed.json</small></button>
      </section>

      <section class="simulation-stack">
        <div class="panel query-panel">
          <div class="panel-header">
            <div>
              <h2>Route Query</h2>
              <p>Enter a simple scenario to inspect the page layout and calculation behavior before the full backend is connected online.</p>
            </div>
            <span class="route-pill"><span>Route</span><strong>SHA -> LAX</strong></span>
          </div>

          <div class="query-inline">
            <label class="compact-field short"><span>Trade</span><select><option>SH</option><option>LH</option><option>TWN</option><option>WAT</option><option>AEU</option></select></label>
            <label class="compact-field short"><span>Month</span><select><option>ALL</option><option>2026-05</option><option>2026-06</option></select></label>
            <label class="compact-field medium"><span>POR</span><input value="SHA" /></label>
            <label class="compact-field medium"><span>DEL</span><input value="LAX" /></label>
            <label class="compact-field short"><span>OFT</span><input id="oft" type="number" value="1350" /></label>
            <label class="compact-field short"><span>Surcharge</span><input id="surcharge" type="number" value="420" /></label>
            <div class="query-actions"><button class="primary-button" id="run">Calculate</button></div>
          </div>
        </div>

        <div class="panel result-panel">
          <div class="result-sticky">
            <div class="result-sticky-head">
              <div class="result-sticky-route"><span>Scenario result</span><strong>SHA -> LAX | 40HQ</strong></div>
              <small>Preview calculation</small>
            </div>
            <div class="kpi-grid">
              <div class="kpi cm-kpi is-positive"><span>CM</span><strong id="cm-value">$0</strong><small>Revenue minus variable cost</small></div>
              <div class="kpi"><span>Margin</span><strong id="margin-value">0%</strong><small>CM / revenue</small></div>
              <div class="kpi"><span>Revenue</span><strong id="revenue-value">$0</strong><small>OFT + surcharge</small></div>
              <div class="kpi"><span>Cost</span><strong id="cost-value">$0</strong><small>THC + feeder + other cost</small></div>
              <div class="kpi"><span>Status</span><strong>Ready</strong><small>Repo deployment files synced</small></div>
            </div>
          </div>

          <div class="detail-columns">
            <div class="detail-panel">
              <div class="detail-header"><h3>Cost Inputs</h3></div>
              <div class="form-grid">
                <label><span>Terminal handling</span><input id="thc" type="number" value="180" /></label>
                <label><span>Feeder / trucking</span><input id="feeder" type="number" value="230" /></label>
                <label><span>Agent commission</span><input id="commission" type="number" value="85" /></label>
                <label><span>Container cost</span><input id="container" type="number" value="70" /></label>
              </div>
            </div>
            <div class="assistant-panel">
              <div class="assistant-panel-head">
                <div><h3>Next Online Step</h3><p>The complete app is prepared for Render/Docker hosting. Once the full source push is allowed through local network access, the backend API and Excel data import can run online.</p></div>
              </div>
              <div class="assistant-card"><div class="assistant-card-top"><span class="assistant-badge medium">Preview</span><strong>Static page synced to GitHub</strong></div><p>This preview gives you a web surface to review layout and direction while the full repository sync is completed.</p></div>
            </div>
          </div>
        </div>
      </section>
    </main>`;

  document.querySelectorAll('input, select').forEach((el) => el.addEventListener('input', render));
  document.getElementById('run').addEventListener('click', render);
  render();
}

mount();
