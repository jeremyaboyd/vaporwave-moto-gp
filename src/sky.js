import * as THREE from 'three';

// Synthwave backdrop: striped sun disc + starfield. Both follow the camera in
// x/z (attached each frame) so they read as infinitely far away.

export function createSky(scene) {
  const group = new THREE.Group();

  // --- Sun: gradient disc with horizontal scanline gaps, via shader ---
  const sunUniforms = {
    uTop: { value: new THREE.Color('#ffd23f') },
    uBottom: { value: new THREE.Color('#ff2fd6') },
  };
  const sunMat = new THREE.ShaderMaterial({
    uniforms: sunUniforms,
    transparent: true,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uTop;
      uniform vec3 uBottom;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float d = length(p);
        if (d > 1.0) discard;
        // horizontal stripes, wider gaps toward the bottom
        float y = vUv.y;
        float gap = smoothstep(0.55, 0.0, y) * 0.55;
        float stripe = step(gap, fract(y * 14.0));
        if (y < 0.5 && stripe < 0.5) discard;
        vec3 col = mix(uBottom, uTop, y);
        float edge = smoothstep(1.0, 0.92, d);
        gl_FragColor = vec4(col, edge);
      }
    `,
  });
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(360, 360), sunMat);
  sun.position.set(0, 110, -900);
  sun.renderOrder = -2;
  group.add(sun);

  // Soft halo behind the sun
  const haloMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: { uColor: { value: new THREE.Color('#ff2fd6') } },
    vertexShader: sunMat.vertexShader,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float d = length(vUv * 2.0 - 1.0);
        float a = smoothstep(1.0, 0.0, d) * 0.28;
        gl_FragColor = vec4(uColor, a * a);
      }
    `,
  });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(720, 720), haloMat);
  halo.position.set(0, 100, -905);
  halo.renderOrder = -3;
  group.add(halo);

  // --- Stars ---
  const starCount = 500;
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const cPink = new THREE.Color('#ff9be8');
  const cCyan = new THREE.Color('#9bf4ff');
  const cWhite = new THREE.Color('#ffffff');
  for (let i = 0; i < starCount; i++) {
    const theta = (Math.random() - 0.5) * Math.PI * 1.6;
    const phi = Math.random() * Math.PI * 0.48 + 0.04;
    const r = 950;
    positions[i * 3] = Math.sin(theta) * Math.cos(phi) * r;
    positions[i * 3 + 1] = Math.sin(phi) * r * 0.55 + 20;
    positions[i * 3 + 2] = -Math.cos(theta) * Math.cos(phi) * r;
    const c = Math.random() < 0.6 ? cWhite : (Math.random() < 0.5 ? cPink : cCyan);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    size: 2.2, sizeAttenuation: false, vertexColors: true,
    transparent: true, opacity: 0.85, fog: false, depthWrite: false,
  }));
  stars.renderOrder = -4;
  group.add(stars);

  scene.add(group);

  return {
    group,
    sunUniforms,
    haloColor: haloMat.uniforms.uColor.value,
    // Follow the camera horizontally so the backdrop never gets closer.
    update(camera) {
      group.position.x = camera.position.x;
      group.position.z = camera.position.z;
    },
  };
}
