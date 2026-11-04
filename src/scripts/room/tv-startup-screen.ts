import { Mesh, Texture, type Object3D } from 'three';

/** Paint on the inner CRT coating, not the reflective outer glass envelope. */
export function paintTVStartup(root: Object3D) {
  const screen = root.getObjectByName('CRT_Screen_Phosphor') ?? root.getObjectByName('CRT_Screen');
  const map = screen instanceof Mesh && !Array.isArray(screen.material) && 'emissiveMap' in screen.material
    ? screen.material.emissiveMap : null;
  if (!(map instanceof Texture) || !(map.image instanceof HTMLCanvasElement)) throw new Error('TV startup screen unavailable');
  const canvas = map.image;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('TV startup canvas unavailable');
  ctx.save();
  ctx.fillStyle = '#1753bd'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f0f4ff'; ctx.textAlign = 'center';
  ctx.font = '64px RoomPixel, monospace'; ctx.fillText('PRESS PLAY', 384, 262);
  ctx.font = '30px RoomPixel, monospace'; ctx.fillText('CLICK TV TO PLAY', 384, 326);
  ctx.restore();
  map.needsUpdate = true;
}
