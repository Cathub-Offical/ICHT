import { createScopedThreejs } from "../../utils/threejs-miniprogram";

function decodeUtf8(bytes) {
  let str = "";
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b < 0x80) {
      str += String.fromCharCode(b);
      i++;
    } else if ((b & 0xE0) === 0xC0) {
      str += String.fromCharCode(((b & 0x1F) << 6) | (bytes[i + 1] & 0x3F));
      i += 2;
    } else if ((b & 0xF0) === 0xE0) {
      str += String.fromCharCode(((b & 0x0F) << 12) | ((bytes[i + 1] & 0x3F) << 6) | (bytes[i + 2] & 0x3F));
      i += 3;
    } else {
      i += 4;
    }
  }
  return str;
}

Component({
  properties: {
    src: { type: String, value: "" },
    width: { type: Number, value: 300 },
    height: { type: Number, value: 300 }
  },
  data: { w: 300, h: 300 },
  observers: {
    "width, height": function (w, h) {
      this.setData({ w, h });
    },
    src: function (url) {
      if (!url) return;
      this._pendingSrc = url;
      if (this._renderer) {
        this._loadModel(url);
      }
    }
  },
  lifetimes: {
    ready() {
      this.setData({ w: this.data.width, h: this.data.height });
      this._touch = null;
      this._initScene();
    },
    detached() {
      this._destroyed = true;
    }
  },
  methods: {
    _initScene() {
      this.createSelectorQuery()
        .select("#model-canvas")
        .node()
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) return;
          const canvas = res[0].node;
          const THREE = createScopedThreejs(canvas);
          this._THREE = THREE;
          this._canvas = canvas;

          const W = this.data.width;
          const H = this.data.height;
          const dpr = wx.getSystemInfoSync().pixelRatio || 1;

          const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
          renderer.setSize(Math.round(W * dpr), Math.round(H * dpr));
          renderer.setClearColor(0xeef1fa, 1);
          this._renderer = renderer;

          const scene = new THREE.Scene();
          this._scene = scene;

          const camera = new THREE.PerspectiveCamera(45, W / H, 0.01, 2000);
          camera.position.set(0, 0, 3);
          this._camera = camera;

          scene.add(new THREE.AmbientLight(0xffffff, 0.8));
          const dir = new THREE.DirectionalLight(0xffffff, 1.5);
          dir.position.set(1, 2, 3);
          scene.add(dir);

          const src = this._pendingSrc || this.data.src;
          if (src) this._loadModel(src);

          this._animate();
          this.triggerEvent("ready");
        });
    },

    _animate() {
      if (this._destroyed) return;
      this._canvas.requestAnimationFrame(() => this._animate());
      if (this._model && !this._touch) {
        this._model.rotation.y += 0.005;
      }
      this._renderer.render(this._scene, this._camera);
    },

    _loadModel(url) {
      if (this._model) {
        this._scene.remove(this._model);
        this._model = null;
      }
      if (url.startsWith("cloud://")) {
        wx.cloud.downloadFile({
          fileID: url,
          success: (res) => {
            wx.getFileSystemManager().readFile({
              filePath: res.tempFilePath,
              success: (fileRes) => {
                try {
                  const group = this._parseGLB(fileRes.data);
                  if (group) {
                    this._scene.add(group);
                    this._model = group;
                    this.triggerEvent("loaded");
                  }
                } catch (e) {
                  this.triggerEvent("error", { message: "模型解析失败: " + e.message });
                }
              },
              fail: () => {
                this.triggerEvent("error", { message: "模型读取失败" });
              }
            });
          },
          fail: () => {
            this.triggerEvent("error", { message: "云文件下载失败" });
          }
        });
      } else {
        wx.request({
          url,
          responseType: "arraybuffer",
          success: (res) => {
            if (res.statusCode !== 200) {
              this.triggerEvent("error", { message: "模型请求失败 " + res.statusCode });
              return;
            }
            try {
              const group = this._parseGLB(res.data);
              if (group) {
                this._scene.add(group);
                this._model = group;
                this.triggerEvent("loaded");
              }
            } catch (e) {
              this.triggerEvent("error", { message: "模型解析失败: " + e.message });
            }
          },
          fail: () => {
            this.triggerEvent("error", { message: "模型下载失败" });
          }
        });
      }
    },

    _parseGLB(buffer) {
      const THREE = this._THREE;
      const view = new DataView(buffer);
      const magic = view.getUint32(0, true);
      if (magic !== 0x46546C67) throw new Error("非 GLB 格式");

      let offset = 12;
      let jsonStr = null;
      let binBuffer = null;

      while (offset < buffer.byteLength) {
        const cLen = view.getUint32(offset, true);
        const cType = view.getUint32(offset + 4, true);
        if (cType === 0x4E4F534A) {
          jsonStr = decodeUtf8(new Uint8Array(buffer, offset + 8, cLen));
        } else if (cType === 0x004E4942) {
          binBuffer = buffer.slice(offset + 8, offset + 8 + cLen);
        }
        offset += 8 + ((cLen + 3) & ~3);
      }

      if (!jsonStr) throw new Error("未找到 GLTF JSON 数据");
      const gltf = JSON.parse(jsonStr);
      if (!gltf.meshes || !gltf.meshes.length) throw new Error("无网格数据");

      const getAccessorData = (idx, TypedArray, components) => {
        const acc = gltf.accessors[idx];
        const bv = gltf.bufferViews[acc.bufferView];
        const start = (bv.byteOffset || 0) + (acc.byteOffset || 0);
        const bytes = TypedArray.BYTES_PER_ELEMENT;
        const slice = binBuffer.slice(start, start + acc.count * components * bytes);
        return new TypedArray(slice);
      };

      const makePrimitive = (prim) => {
        const geo = new THREE.BufferGeometry();
        if (prim.attributes.POSITION !== undefined) {
          geo.addAttribute("position", new THREE.BufferAttribute(getAccessorData(prim.attributes.POSITION, Float32Array, 3), 3));
        }
        if (prim.attributes.NORMAL !== undefined) {
          geo.addAttribute("normal", new THREE.BufferAttribute(getAccessorData(prim.attributes.NORMAL, Float32Array, 3), 3));
        }
        if (prim.attributes.TEXCOORD_0 !== undefined) {
          geo.addAttribute("uv", new THREE.BufferAttribute(getAccessorData(prim.attributes.TEXCOORD_0, Float32Array, 2), 2));
        }
        if (prim.indices !== undefined) {
          const acc = gltf.accessors[prim.indices];
          const TA = acc.componentType === 5125 ? Uint32Array : Uint16Array;
          geo.setIndex(new THREE.BufferAttribute(getAccessorData(prim.indices, TA, 1), 1));
        }
        if (!geo.attributes.normal) geo.computeVertexNormals();

        let color = new THREE.Color(0x888888);
        if (prim.material !== undefined && gltf.materials) {
          const mat = gltf.materials[prim.material];
          const cf = mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorFactor;
          if (cf) color = new THREE.Color(cf[0], cf[1], cf[2]);
        }
        const material = new THREE.MeshPhongMaterial({
          color, side: THREE.DoubleSide, shininess: 60
        });
        return new THREE.Mesh(geo, material);
      };

      const applyNodeTransform = (obj, node) => {
        if (node.matrix) {
          obj.matrix.fromArray(node.matrix);
          obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
        } else {
          if (node.translation) obj.position.fromArray(node.translation);
          if (node.rotation) obj.quaternion.fromArray(node.rotation);
          if (node.scale) obj.scale.fromArray(node.scale);
        }
      };

      const group = new THREE.Group();

      const buildNode = (nodeIdx, parent) => {
        const node = gltf.nodes[nodeIdx];
        const obj = new THREE.Group();
        applyNodeTransform(obj, node);
        if (node.mesh !== undefined) {
          const meshDef = gltf.meshes[node.mesh];
          (meshDef.primitives || []).forEach((prim) => {
            obj.add(makePrimitive(prim));
          });
        }
        (node.children || []).forEach((ci) => buildNode(ci, obj));
        parent.add(obj);
      };

      const sceneIdx = gltf.scene !== undefined ? gltf.scene : 0;
      const sceneDef = gltf.scenes && gltf.scenes[sceneIdx];
      if (sceneDef && sceneDef.nodes) {
        sceneDef.nodes.forEach((ni) => buildNode(ni, group));
      } else {
        gltf.meshes.forEach((mesh) => {
          (mesh.primitives || []).forEach((prim) => group.add(makePrimitive(prim)));
        });
      }

      const box = new THREE.Box3().setFromObject(group);
      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const s = 2 / maxDim;
      group.scale.setScalar(s);
      group.position.set(-center.x * s, -center.y * s, -center.z * s);

      return group;
    },

    onTouchStart(e) {
      const t = e.touches[0];
      this._touch = { x: t.clientX, y: t.clientY };
    },
    onTouchMove(e) {
      if (!this._touch || !this._model) return;
      const t = e.touches[0];
      const dx = t.clientX - this._touch.x;
      const dy = t.clientY - this._touch.y;
      this._model.rotation.y += dx * 0.01;
      this._model.rotation.x += dy * 0.01;
      this._touch = { x: t.clientX, y: t.clientY };
    },
    onTouchEnd() {
      this._touch = null;
    }
  }
});
