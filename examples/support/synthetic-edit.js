/** Synthetic interchange records only; no provider results or actual work. */
export function syntheticEditXml() {
  return `<?xml version="1.0"?><!DOCTYPE xmeml><xmeml version="5"><sequence id="synthetic-sequence"><name>Synthetic edit</name><duration>48</duration><rate><timebase>24</timebase><ntsc>FALSE</ntsc></rate><media>
<video><track><clipitem id="shot"><name>Image</name><start>0</start><end>48</end><in>0</in><out>48</out><file id="image"><pathurl>file:///synthetic/image.png</pathurl></file></clipitem></track></video>
<audio><track><clipitem id="voice"><name>Voice</name><start>0</start><end>48</end><in>0</in><out>48</out><file id="audio"><pathurl>file:///synthetic/voice.wav</pathurl></file></clipitem></track></audio>
</media></sequence></xmeml>`;
}
export function syntheticOtioEdit() {
  const time = (value) => ({ OTIO_SCHEMA: 'RationalTime.1', value, rate: 24 });
  return { OTIO_SCHEMA: 'Timeline.1', tracks: { OTIO_SCHEMA: 'Stack.1', children: [{ OTIO_SCHEMA: 'Track.1', children: [
    { OTIO_SCHEMA: 'Clip.1', name: 'Synthetic image', source_range: { OTIO_SCHEMA: 'TimeRange.1', start_time: time(0), duration: time(48) },
      media_reference: { OTIO_SCHEMA: 'ExternalReference.1', target_url: 'file:///synthetic/image.png' } },
  ] }] } };
}
export function syntheticDependencyContract(version = '1.0') {
  return { version: 1, nodes: [{ classType: 'SyntheticCustom', package: { id: 'synthetic-nodes', version }, files: [{ input: 'model', role: 'model' }] }] };
}
export function syntheticExtensionModel() {
  return { asset: { version: '2.0' }, buffers: [{ byteLength: 96, uri: 'synthetic.bin' }], bufferViews: [{ buffer: 0, byteLength: 96 }],
    images: [{ uri: 'synthetic.ktx2' }], textures: [{ extensions: { KHR_texture_basisu: { source: 0 } } }],
    materials: [{ extensions: { KHR_materials_clearcoat: { clearcoatTexture: { index: 0 } } } }],
    extensionsRequired: ['KHR_texture_basisu'] };
}
