import * as THREE from 'three';

export function init({ scene, camera, renderer, TILT }) {
  const _bk = new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1);
  _bk.needsUpdate = true;
  const earthGeo = new THREE.SphereGeometry(1, 192, 192); // 半径1, 经纬细分192段（越大越圆滑）
  const earthMat = new THREE.ShaderMaterial({
    uniforms: {
      uTex:{value:_bk}, uBumpTex:{value:_bk},
      uCam:{value:camera.position}, uOpacity:{value:1.0},
      uBumpScale:{value:0.0}, // 地形凹凸强度（0=平面，越大起伏越明显）
      uClipInterior:{value:0.0}
    },
    vertexShader: `
      uniform sampler2D uBumpTex; uniform float uBumpScale;
      varying vec2 vUv; varying vec3 vNorm; varying vec3 vWPos;
      void main(){
        vUv = uv;
        float bump = texture2D(uBumpTex, uv).r;
        vec3 pos = position + normal * bump * uBumpScale;
        vNorm = normalize(normalMatrix * normal);
        vWPos = (modelMatrix * vec4(pos,1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos,1.0);
      }`,
    fragmentShader: `
      uniform sampler2D uTex;
      uniform vec3 uCam; uniform float uOpacity; uniform float uClipInterior;
      varying vec2 vUv; varying vec3 vNorm; varying vec3 vWPos;
      void main(){
        if(uClipInterior>0.5){
          if(vWPos.x>0.0 && vWPos.y>0.0 && vWPos.z>0.0) discard;
        }
        vec3 c = texture2D(uTex, vUv).rgb;
        float gridU = abs(fract(vUv.x * 36.0) - 0.5) * 2.0; // 经度网格数（36=每10°一条线）
        float gridV = abs(fract(vUv.y * 18.0) - 0.5) * 2.0; // 纬度网格数（18=每10°一条线）
        float grid = max(smoothstep(0.965,1.0,gridU), smoothstep(0.965,1.0,gridV)); // 网格线宽（0.965越小线越粗）
        c += grid * vec3(0.015, 0.045, 0.09); // 网格线颜色（深蓝色RGB）
        gl_FragColor = vec4(c, uOpacity);
      }`,
    transparent: true
  });
  const earth = new THREE.Mesh(earthGeo, earthMat);
  earth.rotation.x = TILT;
  scene.add(earth);

  const texLoader = new THREE.TextureLoader();
  texLoader.load('earth/bump.jpg', tex => {
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    earthMat.uniforms.uBumpTex.value = tex;
  });

  (function loadEarthTex(){
    document.getElementById('loading').classList.remove('hidden');
    texLoader.load('earth/earth.jpg', tex => {
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      earthMat.uniforms.uTex.value = tex;
      document.getElementById('loading').classList.add('hidden');
    });
  })();

  /* Lat/Lon Grid Overlay */
  const gridGroup = new THREE.Group();
  gridGroup.rotation.x = TILT;
  scene.add(gridGroup);
  const gridMat = new THREE.LineBasicMaterial({color:0x2088aa,transparent:true,opacity:0.1,depthWrite:false}); // 经纬线颜色(青蓝)和透明度(0.1很淡)

  for(let lat=-75;lat<=75;lat+=15){ // 纬线：每15°一条，范围±75°
    const pts=[];
    for(let lng=-180;lng<=180;lng+=3){ const v=lngLatToVec3(lng,lat,1.004); pts.push(v.x,v.y,v.z); }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
    gridGroup.add(new THREE.Line(g,gridMat));
  }
  for(let lng=-180;lng<180;lng+=15){ // 经线：每15°一条
    const pts=[];
    for(let lat=-90;lat<=90;lat+=3){ const v=lngLatToVec3(lng,lat,1.004); pts.push(v.x,v.y,v.z); }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
    gridGroup.add(new THREE.Line(g,gridMat));
  }

  /* Stars */
  (function(){
    const N=6000,pos=new Float32Array(N*3),sz=new Float32Array(N); // N=星星数量
    for(let i=0;i<N;i++){
      const r=50+Math.random()*150,th=Math.random()*Math.PI*2,ph=Math.acos(2*Math.random()-1);
      pos[i*3]=r*Math.sin(ph)*Math.cos(th);pos[i*3+1]=r*Math.sin(ph)*Math.sin(th);pos[i*3+2]=r*Math.cos(ph);sz[i]=.3+Math.random()*1.2; // 星星大小0.3~1.5
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('size',new THREE.BufferAttribute(sz,1));
    scene.add(new THREE.Points(g,new THREE.ShaderMaterial({
      vertexShader:`attribute float size;void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_PointSize=size*(200.0/-mv.z);gl_Position=projectionMatrix*mv;}`,
      fragmentShader:`void main(){float d=length(gl_PointCoord-vec2(.5));if(d>.5)discard;gl_FragColor=vec4(.9,.92,1.,smoothstep(.5,.1,d)*.8);}`,
      transparent:true,depthWrite:false})));
  })();

  /* Terrain toggle */
  let showBump = false;
  const terrainBtn = document.getElementById('ep-terrain') || document.getElementById('tb-terrain');
  if(terrainBtn) terrainBtn.addEventListener('click', () => {
    showBump = !showBump;
    terrainBtn.classList.toggle('active', showBump);
    earthMat.uniforms.uBumpScale.value = showBump ? 0.018 : 0.0; // 0.018=凹凸贴图高度，越大地形越夸张
  });

  return { earth, earthMat, gridGroup, texLoader };
}

export function lngLatToVec3(lng, lat, r) {
  const phi = (90-lat)*Math.PI/180, theta = (lng+180)*Math.PI/180;
  return new THREE.Vector3(-r*Math.cos(theta)*Math.sin(phi), r*Math.cos(phi), r*Math.sin(theta)*Math.sin(phi));
}
