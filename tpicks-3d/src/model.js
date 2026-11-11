/** Original TPICKS contours with rounded vector edges and polished resin surfaces. */
function softenSurfaceNormals(THREE, geometry) {
  // ExtrudeGeometry is non-indexed. Angle-weighted normals remove tiny faceted
  // reflection stripes without changing the logo silhouette or face positions.
  const pos=geometry.getAttribute('position');
  const originalNormals=geometry.getAttribute('normal');
  const accum=new Map();
  const vertexKeys=new Array(pos.count);
  const vectors=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
  const ab=new THREE.Vector3(),ac=new THREE.Vector3(),normal=new THREE.Vector3();
  for(let i=0;i<pos.count;i++) vertexKeys[i]=`${Math.round(pos.getX(i)*1e5)},${Math.round(pos.getY(i)*1e5)},${Math.round(pos.getZ(i)*1e5)}`;
  for(let i=0;i<pos.count;i+=3){
    for(let j=0;j<3;j++) vectors[j].fromBufferAttribute(pos,i+j);
    normal.crossVectors(ab.subVectors(vectors[1],vectors[0]),ac.subVectors(vectors[2],vectors[0]));
    if(normal.lengthSq()<1e-14) continue;
    normal.normalize();
    for(let j=0;j<3;j++){
      ab.subVectors(vectors[(j+1)%3],vectors[j]).normalize();
      ac.subVectors(vectors[(j+2)%3],vectors[j]).normalize();
      const weight=Math.acos(THREE.MathUtils.clamp(ab.dot(ac),-1,1));
      const key=vertexKeys[i+j];
      if(!accum.has(key)) accum.set(key,new THREE.Vector3());
      accum.get(key).addScaledVector(normal,weight);
    }
  }
  const normals=new Float32Array(pos.count*3);
  for(let i=0;i<pos.count;i++){
    const n=accum.get(vertexKeys[i]);
    if(n) n.clone().normalize().toArray(normals,i*3);
  }
  // Flat front/back caps must keep their original planar normals. Smoothing
  // bevel normals across their large triangles creates false diagonal creases.
  for(const group of geometry.groups){
    if(group.materialIndex!==0) continue;
    for(let i=group.start;i<group.start+group.count;i++){
      normals[i*3]=0;
      normals[i*3+1]=0;
      normals[i*3+2]=originalNormals.getZ(i)<0?-1:1;
    }
  }
  geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));
  return geometry;
}

export function createTPICKSModel(THREE, data, options = {}) {
  const { Group, Shape, Path, Mesh, MeshPhysicalMaterial, ExtrudeGeometry } = THREE;
  const width = options.width ?? 9;
  const scale = width / data.width;
  const coords = ([x, y]) => [(x - data.width / 2) * scale, (data.height / 2 - y) * scale];
  const makeShape = (contour) => {
    const shape = new Shape();
    const trace = (path, ring, preserveCorners) => {
      const pts=ring.map(coords);
      const mid=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
      path.moveTo(...mid(pts.at(-1),pts[0]));
      pts.forEach((p,i)=>{
        const prev=pts[(i+pts.length-1)%pts.length],next=pts[(i+1)%pts.length];
        const a=[p[0]-prev[0],p[1]-prev[1]],b=[next[0]-p[0],next[1]-p[1]];
        const turn=Math.abs(Math.atan2(a[0]*b[1]-a[1]*b[0],a[0]*b[0]+a[1]*b[1]));
        const end=mid(p,next);
        if(preserveCorners && turn>0.95){path.lineTo(...p);path.lineTo(...end);}
        else path.quadraticCurveTo(...p,...end);
      });
      path.closePath();
    };
    trace(shape,contour.outer,Boolean(contour.preserveCorners));
    for (const hole of contour.holes) {
      const path = new Path();
      trace(path,hole,Boolean(contour.preserveCorners));
      shape.holes.push(path);
    }
    return shape;
  };

  const group = new Group();
  group.name = 'TPICKS_Polished_Lime_Resin';
  group.userData = { source: 'User-supplied TPICKS logo', width, style: 'Smooth luminous lime resin / polished raised lettering',version:3 };
  const baseFace = new MeshPhysicalMaterial({
    color: options.baseColor ?? '#cbff3e',
    metalness: 0.3, roughness: 0.13,
    clearcoat: 1, clearcoatRoughness: 0.035,
    envMapIntensity: 1.15, ior:1.52,
  });
  const baseEdge = new MeshPhysicalMaterial({
    color: '#b4e72d', metalness: 0.48, roughness: 0.12,
    clearcoat: 1, clearcoatRoughness: 0.035,
    envMapIntensity: 1.3,
  });
  const letterFace = new MeshPhysicalMaterial({
    color: options.letterColor ?? '#77a716',
    metalness: 0.42, roughness: 0.13,
    clearcoat: 1, clearcoatRoughness: 0.03,
    envMapIntensity: 1.05,
  });
  const letterEdge = new MeshPhysicalMaterial({
    color: '#54791a', metalness: 0.46, roughness: 0.16,
    clearcoat: 1, clearcoatRoughness: 0.035,
  });
  baseFace.name='Lime_Resin_Cap';
  baseEdge.name='Lime_Resin_Bevel';
  letterFace.name='Raised_Letter_Cap';
  letterEdge.name='Raised_Letter_Bevel';
  for (const contour of data.base) {
    const geometry = new ExtrudeGeometry(makeShape(contour), {
      depth: 0.31, steps: 1, bevelEnabled: true,
      bevelThickness: 0.072, bevelSize: 0.036, bevelSegments: 5,
      curveSegments: 3,
    });
    geometry.translate(0, 0, -0.22);
    softenSurfaceNormals(THREE,geometry);
    const mesh = new Mesh(geometry, [baseFace, baseEdge]);
    mesh.name = 'Lime_Beveled_Backplate';
    group.add(mesh);
  }
  data.letters.forEach((contour, index) => {
    const geometry = new ExtrudeGeometry(makeShape({...contour,preserveCorners:true}), {
      depth: 0.065, steps: 1, bevelEnabled: true,
      bevelThickness: 0.024, bevelSize: 0.01, bevelSegments: 4,
      curveSegments: 3,
    });
    geometry.translate(0, 0, 0.16);
    softenSurfaceNormals(THREE,geometry);
    const mesh = new Mesh(geometry, [letterFace, letterEdge]);
    mesh.name = `Raised_Letter_${index + 1}`;
    group.add(mesh);
  });
  return group;
}

export function disposeModel(group) {
  const materials = new Set();
  group.traverse(object => {
    object.geometry?.dispose();
    const list = Array.isArray(object.material) ? object.material : [object.material];
    list.forEach(material => material && materials.add(material));
  });
  materials.forEach(material => material.dispose());
}
