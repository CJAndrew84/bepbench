import { IfcAPI } from 'web-ifc';
import { elementProperties } from './ifc-properties.js';
let api, modelID;
const val = x => x?.value ?? x ?? '';
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'open') {
      api = new IfcAPI(); api.SetWasmPath('/wasm/', true); await api.Init(undefined, true);
      modelID = api.OpenModel(new Uint8Array(data.buffer), { COORDINATE_TO_ORIGIN: true, CIRCLE_SEGMENTS: 16 });
      if (modelID < 0) throw new Error('The IFC file could not be opened.');
      const geometries = [], elements = [], ids = new Set(); let truncated = false;
      api.StreamAllMeshes(modelID, (mesh, index, total) => {
        if (elements.length >= 20000) { truncated = true; return; }
        const line = api.GetLine(modelID, mesh.expressID);
        const cls = api.GetNameFromTypeCode(line.type);
        if (['IFCOPENINGELEMENT', 'IFCVIRTUALELEMENT', 'IFCANNOTATION', 'IFCGRID', 'IFCSPACE'].includes(cls)) return;
        if (!ids.has(mesh.expressID)) {
          ids.add(mesh.expressID); elements.push({ id: mesh.expressID, name: String(val(line.Name) || cls), guid: String(val(line.GlobalId)), cls });
        }
        for (let i = 0; i < mesh.geometries.size(); i++) {
          const placed = mesh.geometries.get(i), geometry = api.GetGeometry(modelID, placed.geometryExpressID);
          const vertices = new Float32Array(api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize()));
          const indices = new Uint32Array(api.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize()));
          geometries.push({ id: mesh.expressID, vertices, indices, matrix: placed.flatTransformation, color: [placed.color.x, placed.color.y, placed.color.z, placed.color.w] });
          geometry.delete();
        }
        if (index % 50 === 0) self.postMessage({ type: 'progress', message: `Reading IFC geometry… ${index + 1} / ${total}` });
      });
      self.postMessage({ type: 'model', schema: api.GetModelSchema(modelID), elements, geometries, truncated }, geometries.flatMap(g => [g.vertices.buffer, g.indices.buffer]));
    } else if (data.type === 'properties') {
      const { attributes, properties } = await elementProperties(api, modelID, data.id);
      self.postMessage({ type: 'properties', id: data.id, attributes, properties });
    }
  } catch (error) { self.postMessage({ type: 'error', message: error.message || String(error) }); }
};
