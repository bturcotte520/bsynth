// Standard musical typing layout (GarageBand-style)
// Home/Q rows map two octaves starting at C4 (MIDI 60)
//
// White keys:  a  s  d  f  g  h  j  k  l  ;
//              C4 D4 E4 F4 G4 A4 B4 C5 D5 E5
// Black keys:  w  e     t  y  u     o  p
//              C# D#    F# G# A#    C# D#

export const keyToMidi: Record<string, number> = {
  a: 60, // C4
  w: 61, // C#4
  s: 62, // D4
  e: 63, // D#4
  d: 64, // E4
  f: 65, // F4
  t: 66, // F#4
  g: 67, // G4
  y: 68, // G#4
  h: 69, // A4
  u: 70, // A#4
  j: 71, // B4
  k: 72, // C5
  o: 73, // C#5
  l: 74, // D5
  p: 75, // D#5
  // eslint-disable-next-line @typescript-eslint/naming-convention
  ';': 76, // E5
};

export const midiToKey: Record<number, string> = Object.fromEntries(
  Object.entries(keyToMidi).map(([key, midi]) => [midi, key]),
);
