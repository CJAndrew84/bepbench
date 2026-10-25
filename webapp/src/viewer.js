import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { escape } from './exports.js';
import { getModel, saveModel } from './storage.js';
export async function mountViewer(container, project, defaults, schemas, onStatus) {
  const canvasHost = container.querySelector('.model-canvas'), info = container.querySelector('.model-info'), tree = container.querySelector('.object-tree'), props = container.querySelector('.element-properties');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); }
  catch { canvasHost.textContent = '3D viewing needs WebGL in this browser. Open an IFC to inspect its element list and properties below.'; }
  if (renderer) { renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.localClippingEnabled = true; canvasHost.append(renderer.domElement); }
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#e9ede8');
  const camera = new THREE.PerspectiveCamera(42, 1, .01, 100000), group = new THREE.Group(); scene.add(group);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x778779, 2.4));
  const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(10, 20, 10); scene.add(light);
  const controls = renderer ? new OrbitControls(camera, renderer.domElement) : null; if (controls) controls.enableDamping = true;
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), clipping = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e10);
  let worker, selected, items = [], meshes = [], box, alive = true, raf, currentId, dragStart;
  const allClasses = Object.values(schemas).flat(), canonical = cls => allClasses.find(c => c.toUpperCase() === cls) || cls;
  const fit = () => {
    if (!meshes.length) return;
    box = new THREE.Box3().setFromObject(group); const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const distance = Math.max(size.x, size.y, size.z, 1) * 1.8;
    camera.position.copy(center).add(new THREE.Vector3(distance, distance * .7, distance));
    camera.near = Math.max(distance / 10000, .001); camera.far = distance * 100; camera.updateProjectionMatrix();
    if (controls) { controls.target.copy(center); controls.update(); }
  };
  const resize = new ResizeObserver(() => { const { width, height } = canvasHost.getBoundingClientRect(); if (renderer) renderer.setSize(Math.max(width, 1), Math.max(height, 1)); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); }); resize.observe(canvasHost);
  function render() { if (!alive || !renderer) return; raf = requestAnimationFrame(render); controls.update(); renderer.render(scene, camera); } render();
  function clear() { for (const m of meshes) { m.geometry.dispose(); m.material.dispose(); } meshes = []; group.clear(); selected = null; }
  function filter() {
    const cls = container.querySelector('[name="ifc-class"]').value, mode = container.querySelector('[name="ifc-mode"]').value, lod = container.querySelector('[name="ifc-lod"]').value;
    const policy = defaults.viewer.lod.levels[lod];
    const include = new Set(policy.include.map(c => c.toUpperCase())), exclude = new Set((policy.exclude || []).map(c => c.toUpperCase()));
    meshes.forEach(m => {
      m.visible = (!cls || m.userData.cls === cls) && (include.has('*') || include.has(m.userData.cls)) && !exclude.has(m.userData.cls);
      m.material.wireframe = mode === 'wireframe'; m.material.transparent = mode === 'transparent' || mode === 'xray'; m.material.opacity = mode === 'transparent' ? .3 : mode === 'xray' ? .12 : m.userData.opacity;
      m.material.depthWrite = mode !== 'xray'; m.material.needsUpdate = true;
    });
    const query = container.querySelector('[name="ifc-search"]').value.toLowerCase();
    tree.innerHTML = items.filter(i => (!cls || i.cls === cls) && `${i.name} ${i.guid} ${i.cls}`.toLowerCase().includes(query)).slice(0, 200).map(i => `<button type="button" data-element="${i.id}" title="${escape(i.guid)}"><span>${escape(i.name)}</span><small>${escape(canonical(i.cls))}</small></button>`).join('') || '<p class="muted">No matching elements.</p>';
  }
  async function select(id) {
    currentId = id;
    if (selected) selected.forEach(m => m.material.emissive.set(0));
    selected = meshes.filter(m => m.userData.id === id); selected.forEach(m => m.material.emissive.set('#80632c'));
    props.innerHTML = '<p class="muted">Reading element properties…</p>'; worker?.postMessage({ type: 'properties', id });
  }
  async function open(buffer, filename, persist = false) {
    if (buffer.byteLength > 200 * 1024 * 1024) throw new Error('The browser viewer accepts IFC files up to 200 MB. Use the native Python app for larger models.');
    const previous = worker; previous?.terminate();
    info.textContent = `Opening ${filename}…`; props.innerHTML = ''; tree.innerHTML = ''; clear();
    const sourceBuffer = persist ? buffer.slice(0) : null;
    worker = new Worker(new URL('./ifc-worker.js', import.meta.url), { type: 'module' });
    worker.onerror = () => { if (alive) info.textContent = 'The model worker stopped. Try a smaller IFC file or use the native Python app.'; };
    worker.onmessage = ({ data }) => {
      if (!alive) return;
      if (data.type === 'progress') info.textContent = data.message;
      if (data.type === 'error') { info.textContent = `IFC: ${data.message}`; onStatus(data.message, true); }
      if (data.type === 'model') {
        if (sourceBuffer) saveModel(project.slug, { filename, buffer: sourceBuffer }).catch(error => onStatus(`Model opened but could not be saved: ${error.message}`, true));
        items = data.elements; const byId = new Map(items.map(i => [i.id, i]));
        for (const g of data.geometries) {
          const interleaved = new THREE.InterleavedBuffer(g.vertices, 6), geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(interleaved, 3, 0)); geometry.setAttribute('normal', new THREE.InterleavedBufferAttribute(interleaved, 3, 3)); geometry.setIndex(new THREE.BufferAttribute(g.indices, 1));
          const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(g.color[0], g.color[1], g.color[2]), roughness: .75, metalness: .05, side: THREE.DoubleSide, transparent: g.color[3] < 1, opacity: g.color[3], clippingPlanes: [clipping] });
          const mesh = new THREE.Mesh(geometry, material); mesh.applyMatrix4(new THREE.Matrix4().fromArray(g.matrix)); mesh.userData = { ...byId.get(g.id), opacity: g.color[3] }; group.add(mesh); meshes.push(mesh);
        }
        const classes = [...new Set(items.map(i => i.cls))].sort();
        container.querySelector('[name="ifc-class"]').innerHTML = '<option value="">All element classes</option>' + classes.map(c => `<option value="${escape(c)}">${escape(canonical(c))}</option>`).join('');
        info.textContent = `${filename} · ${data.schema} · ${items.length.toLocaleString()} elements${data.truncated ? ' · DISPLAY LIMITED TO 20,000 ELEMENTS' : ''}${renderer ? '' : ' · 3D unavailable; element properties available'}`;
        fit(); filter();
      }
      if (data.type === 'properties' && data.id === currentId) {
        const item = items.find(i => i.id === data.id), cls = canonical(item?.cls || '');
        const source = defaults.ids.sources[project.framework], requirements = source ? project.values[source.section]?.[source.field] || [] : [];
        const matching = requirements.filter(r => String(r[source.columns.ifc_class] || '').toUpperCase() === item?.cls);
        props.innerHTML = `<h4>${escape(item?.name)}</h4><p class="muted">${escape(cls)}</p><dl>${Object.entries(data.attributes).map(([k, v]) => `<dt>${escape(k)}</dt><dd>${escape(v)}</dd>`).join('')}</dl><h4>Plan requirements</h4>${matching.length ? matching.map(r => `<p>${escape(Object.values(r).filter(Boolean).join(' · '))}</p>`).join('') : '<p class="muted">No explicit IFC-class requirement in the current LOIN table.</p>'}${data.properties.map(ps => `<details><summary>${escape(ps.name)}</summary><dl>${Object.entries(ps.values).map(([k, v]) => `<dt>${escape(k)}</dt><dd>${escape(v)}</dd>`).join('')}</dl></details>`).join('')}`;
      }
    };
    worker.postMessage({ type: 'open', buffer }, [buffer]);
  }
  renderer?.domElement.addEventListener('pointerdown', e => dragStart = [e.clientX, e.clientY]);
  renderer?.domElement.addEventListener('pointerup', e => {
    if (!dragStart || Math.hypot(e.clientX - dragStart[0], e.clientY - dragStart[1]) > 5) return;
    const r = renderer.domElement.getBoundingClientRect(); pointer.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(meshes).find(h => h.object.visible); if (hit) select(hit.object.userData.id);
  });
  tree.addEventListener('click', e => { const button = e.target.closest('[data-element]'); if (button) select(Number(button.dataset.element)); });
  container.querySelectorAll('select, [name="ifc-search"]').forEach(el => el.addEventListener('input', filter));
  container.querySelector('[data-fit]').onclick = fit;
  container.querySelector('[name="ifc-section"]').oninput = e => { if (box) clipping.constant = box.max.y - (box.max.y - box.min.y) * Number(e.target.value) / 100 + .001; };
  container.querySelector('[data-open-demo]').onclick = () => fetch('/demo.ifc').then(r => { if (!r.ok) throw new Error('Sample model unavailable.'); return r.arrayBuffer(); }).then(b => open(b, 'Duplex_A.ifc', true)).catch(e => onStatus(e.message, true));
  container.querySelector('[name="ifc-file"]').onchange = async e => { try { const file = e.target.files[0]; if (file?.size > 200 * 1024 * 1024) throw new Error('The browser viewer accepts IFC files up to 200 MB.'); if (file) await open(await file.arrayBuffer(), file.name, true); } catch (error) { onStatus(error.message, true); } };
  getModel(project.slug).then(model => { if (alive && model) return open(model.buffer, model.filename); }).catch(e => onStatus(e.message, true));
  return { dispose() { alive = false; worker?.terminate(); cancelAnimationFrame(raf); resize.disconnect(); controls?.dispose(); clear(); renderer?.dispose(); renderer?.forceContextLoss(); } };
}
