const value = x => x?.value ?? x ?? '';
export async function elementProperties(api, modelID, id) {
  const line = api.GetLine(modelID, id), attributes = {};
  for (const key of ['GlobalId', 'Name', 'Description', 'ObjectType', 'Tag', 'PredefinedType']) if (line[key] != null) attributes[key] = String(value(line[key]));
  // web-ifc's includeTypeProperties flag selects type sets instead of merging
  // them with instance sets. Read both so Pset_DoorCommon and peers are retained.
  const instance = await api.properties.getPropertySets(modelID, id, true, false);
  const inherited = await api.properties.getPropertySets(modelID, id, true, true);
  const psets = [...new Map([...instance, ...inherited].map(ps => [ps.expressID, ps])).values()];
  const properties = psets.map(ps => ({ name: String(value(ps.Name)), values: Object.fromEntries((ps.HasProperties || ps.Quantities || []).map(p => [String(value(p.Name)), String(value(p.NominalValue ?? p.LengthValue ?? p.AreaValue ?? p.VolumeValue ?? p.CountValue ?? p.WeightValue ?? p.Description))])) }));
  return { attributes, properties };
}
