"""Regenerate synthetic OTIO fixtures/expected ranges with OpenTimelineIO 0.18.1.

Development verification only: pip install opentimelineio==0.18.1 in a disposable venv.
No source media is read, generated or downloaded.
"""
import json
from pathlib import Path
import opentimelineio as otio

assert otio.__version__ == "0.18.1"
rt = otio.opentime.RationalTime
tr = otio.opentime.TimeRange
clip_a = otio.schema.Clip(name="Synthetic A", media_reference=otio.schema.ExternalReference(target_url="file:///synthetic/a.mov"), source_range=tr(rt(48, 24), rt(48, 24)))
clip_b = otio.schema.Clip(name="Synthetic B", media_reference=otio.schema.ExternalReference(target_url="file:///synthetic/b.mov"), source_range=tr(rt(90, 30), rt(60, 30)))
track = otio.schema.Track(name="Synthetic video", kind=otio.schema.TrackKind.Video, children=[
    clip_a,
    otio.schema.Transition(transition_type=otio.schema.TransitionTypes.SMPTE_Dissolve, in_offset=rt(6, 24), out_offset=rt(6, 24)),
    clip_b,
    otio.schema.Gap(source_range=tr(rt(0, 24), rt(24, 24))),
])
timeline = otio.schema.Timeline(name="Synthetic timeline", tracks=[track], global_start_time=rt(86400, 24))
expected = []
for i, item in enumerate(track):
    parent = track.range_of_child_at_index(i)
    expected.append({"index": i, "kind": item.schema_name(), "start": parent.start_time.to_seconds(), "duration": parent.duration.to_seconds()})
directory = Path(__file__).resolve().parent.parent / "test" / "fixtures" / "structures"
directory.mkdir(parents=True, exist_ok=True)
(directory / "otio-oracle.json").write_text(otio.adapters.write_to_string(timeline, "otio_json") + "\n")
(directory / "otio-oracle.expected.json").write_text(json.dumps({"library": "OpenTimelineIO", "version": otio.__version__, "ranges": expected}, indent=2) + "\n")
print(json.dumps({"verified": True, "libraryVersion": otio.__version__, "ranges": expected}))
