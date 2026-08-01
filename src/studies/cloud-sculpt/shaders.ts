// ---------------------------------------------------------------------------
// Raymarching shader: renders the metaball field directly from the ball
// list (no mesh step). See README "Setup" for why raymarch was chosen over
// marching cubes for this Study.
// ---------------------------------------------------------------------------

// 256: MPM の凍結レシピ（実測136〜153球）が全球映る余裕を持たせた値。
// 64 のとき「画面は最初の64球・STL は全球」という不一致が作者実機で起きた（2026-07-10）。
// ループは uBallCount で早期 break するので、少球時の描画コストは変わらない。
export const MAX_BALLS = 256;

export const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  precision highp float;

  uniform vec3 uBallPos[${MAX_BALLS}];
  uniform float uBallRadius[${MAX_BALLS}];
  uniform int uBallCount;
  uniform float uK;
  uniform vec3 uCamPos;
  uniform mat4 uCamInverseProjection;
  uniform mat4 uCamInverseView;
  uniform vec2 uResolution;
  uniform vec2 uPixelJitter;
  uniform int uProgressiveLinearOutput;
  uniform int uProgressiveSampleIndex;
  uniform int uSelectedIndex;
  uniform vec3 uLightDir;
  uniform int uRenderMode;
  uniform float uIor;
  uniform float uDispersion;
  uniform int uDispersionMode;
  uniform int uRainbowModel;
  uniform float uStressAmount;
  uniform float uPolarization;
  uniform vec3 uHostAbsorptionRgb;
  uniform vec3 uOpticalTint;
  uniform int uInclusionEnabled;
  uniform int uInclusionStatus;
  uniform vec3 uInclusionCenter;
  uniform float uInclusionRadius;
  uniform float uInclusionIor;
  uniform vec3 uInclusionAbsorptionRgb;
  uniform int uNaturalView;
  uniform float uSkyIntensity;
  uniform float uSunIntensity;
  uniform float uSunSize;
  uniform float uGroundReflectance;
  uniform float uOpticalExposure;
  uniform float uSurfaceRoughness;
  uniform float uSurfaceVariation;
  uniform float uMaterialVariation;
  uniform float uMaterialScale;
  uniform float uEnvironmentContrast;
  uniform float uEnvironmentRotation;
  uniform float uEnvironmentMist;
  uniform int uMonochrome;
  uniform sampler2D uCausticMap;
  uniform sampler2D uReceiverLossMap;
  uniform vec4 uCausticBounds;
  uniform vec2 uCausticResolution;
  uniform float uCausticAvailable;
  uniform float uCausticStrength;
  uniform int uReceiverDisplayMode;
  uniform float uReceiverY;
  uniform int uCompatibilityMode;

  varying vec2 vUv;

  vec4 sampleReceiverTransport(vec2 uv) {
    vec2 resolution = max(uCausticResolution, vec2(1.0));
    vec2 grid = uv * resolution - 0.5;
    vec2 base = floor(grid);
    vec2 fraction = fract(grid);
    vec2 texel = 1.0 / resolution;
    vec2 uv00 = (base + 0.5) * texel;
    vec4 c00 = texture2D(uCausticMap, clamp(uv00, vec2(0.0), vec2(1.0)));
    vec4 c10 = texture2D(uCausticMap, clamp(uv00 + vec2(texel.x, 0.0), vec2(0.0), vec2(1.0)));
    vec4 c01 = texture2D(uCausticMap, clamp(uv00 + vec2(0.0, texel.y), vec2(0.0), vec2(1.0)));
    vec4 c11 = texture2D(uCausticMap, clamp(uv00 + texel, vec2(0.0), vec2(1.0)));
    return mix(mix(c00, c10, fraction.x), mix(c01, c11, fraction.x), fraction.y);
  }

  vec3 sampleReceiverLoss(vec2 uv) {
    vec2 resolution = max(uCausticResolution, vec2(1.0));
    vec2 grid = uv * resolution - 0.5;
    vec2 base = floor(grid);
    vec2 fraction = fract(grid);
    vec2 texel = 1.0 / resolution;
    vec2 uv00 = (base + 0.5) * texel;
    vec3 c00 = texture2D(uReceiverLossMap, clamp(uv00, vec2(0.0), vec2(1.0))).rgb;
    vec3 c10 = texture2D(uReceiverLossMap, clamp(uv00 + vec2(texel.x, 0.0), vec2(0.0), vec2(1.0))).rgb;
    vec3 c01 = texture2D(uReceiverLossMap, clamp(uv00 + vec2(0.0, texel.y), vec2(0.0), vec2(1.0))).rgb;
    vec3 c11 = texture2D(uReceiverLossMap, clamp(uv00 + texel, vec2(0.0), vec2(1.0))).rgb;
    return mix(mix(c00, c10, fraction.x), mix(c01, c11, fraction.x), fraction.y);
  }

  // Polynomial smooth-min (Inigo Quilez). k=0 -> hard min (see field.ts).
  float smoothMin(float a, float b, float k) {
    if (k <= 0.0) return min(a, b);
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  float sdBall(vec3 p, vec3 c, float r) {
    return length(p - c) - r;
  }

  // Whole-field SDF: all balls smooth-min'd together.
  // Must stay in lockstep with fieldSdf() in field.ts (CPU picking).
  float map(vec3 p) {
    float d = 1e5;
    for (int i = 0; i < ${MAX_BALLS}; i++) {
      if (i >= uBallCount) break;
      float bd = sdBall(p, uBallPos[i], uBallRadius[i]);
      d = (i == 0) ? bd : smoothMin(d, bd, uK);
    }
    return d;
  }

  bool rayInclusionInterval(
    vec3 origin,
    vec3 direction,
    out float nearDistance,
    out float farDistance
  ) {
    nearDistance = 0.0;
    farDistance = 0.0;
    if (uInclusionEnabled != 1 || uInclusionRadius <= 0.0) return false;
    vec3 offset = origin - uInclusionCenter;
    float projection = dot(offset, direction);
    float determinant = projection * projection
      - (dot(offset, offset) - uInclusionRadius * uInclusionRadius);
    if (determinant < 0.0) return false;
    float root = sqrt(max(0.0, determinant));
    nearDistance = -projection - root;
    farDistance = -projection + root;
    return farDistance > 0.0;
  }

  float normalInterfaceTransmission(float firstIor, float secondIor) {
    if (abs(firstIor - secondIor) < 0.00001) return 1.0;
    float reflection = pow(
      (firstIor - secondIor) / max(0.0001, firstIor + secondIor),
      2.0
    );
    return 1.0 - reflection;
  }

  vec3 estimateNormal(vec3 p) {
    float e = 0.0015;
    return normalize(vec3(
      map(p + vec3(e, 0.0, 0.0)) - map(p - vec3(e, 0.0, 0.0)),
      map(p + vec3(0.0, e, 0.0)) - map(p - vec3(0.0, e, 0.0)),
      map(p + vec3(0.0, 0.0, e)) - map(p - vec3(0.0, 0.0, e))
    ));
  }

  float materialPattern(vec3 p) {
    vec3 q = p * max(0.1, uMaterialScale);
    float broad = sin(q.x * 1.37 + sin(q.z * 0.73))
      + sin(q.y * 1.11 - q.x * 0.47)
      + sin(q.z * 1.53 + q.y * 0.39);
    float fine = sin(dot(q, vec3(2.31, -1.73, 1.19)) + sin(q.y * 1.9));
    float separated = smoothstep(-0.28, 0.32, broad * 0.42 + fine * 0.25);
    return mix(1.0, mix(0.38, 1.82, separated), uMaterialVariation);
  }

  vec3 perturbSurfaceNormal(vec3 normal, vec3 p) {
    vec3 q = p * (3.7 + uMaterialScale * 0.8);
    vec3 variation = vec3(
      sin(q.y * 1.17 + q.z * 0.83),
      sin(q.z * 1.31 - q.x * 0.71),
      sin(q.x * 1.07 + q.y * 0.97)
    );
    variation -= normal * dot(variation, normal);
    return normalize(normal + variation * uSurfaceVariation * 0.34);
  }

  float segmentMaterialDensity(vec3 startPoint, vec3 endPoint) {
    float density = 0.0;
    for (int i = 0; i < 7; i++) {
      float t = (float(i) + 0.5) / 7.0;
      density += materialPattern(mix(startPoint, endPoint, t));
    }
    return density / 7.0;
  }

  float junctionStress(vec3 p) {
    float nearest = 1e5;
    float second = 1e5;
    for (int i = 0; i < ${MAX_BALLS}; i++) {
      if (i >= uBallCount) break;
      float distanceToShell = abs(sdBall(p, uBallPos[i], uBallRadius[i]));
      if (distanceToShell < nearest) {
        second = nearest;
        nearest = distanceToShell;
      } else if (distanceToShell < second) {
        second = distanceToShell;
      }
    }
    float shellCompetition = max(0.0, second - nearest);
    return 1.0 - smoothstep(0.06, 0.52, shellCompetition);
  }

  vec3 rotateEnvironment(vec3 direction) {
    float cosine = cos(uEnvironmentRotation);
    float sine = sin(uEnvironmentRotation);
    return vec3(
      direction.x * cosine - direction.z * sine,
      direction.y,
      direction.x * sine + direction.z * cosine
    );
  }

  float ggxSpecular(vec3 normal, vec3 viewDirection, vec3 lightDirection) {
    float nDotV = max(dot(normal, viewDirection), 0.001);
    float nDotL = max(dot(normal, lightDirection), 0.0);
    if (nDotL <= 0.0) return 0.0;
    vec3 halfDirection = normalize(viewDirection + lightDirection);
    float nDotH = max(dot(normal, halfDirection), 0.0);
    float vDotH = max(dot(viewDirection, halfDirection), 0.0);
    float alpha = max(0.025, uSurfaceRoughness * uSurfaceRoughness);
    float alphaSquared = alpha * alpha;
    float denominator = nDotH * nDotH * (alphaSquared - 1.0) + 1.0;
    float distribution = alphaSquared / max(0.001, 3.14159265 * denominator * denominator);
    float geometryK = (alpha + 1.0) * (alpha + 1.0) * 0.125;
    float geometryV = nDotV / mix(nDotV, 1.0, geometryK);
    float geometryL = nDotL / mix(nDotL, 1.0, geometryK);
    float f0 = pow((uIor - 1.0) / (uIor + 1.0), 2.0);
    float fresnel = f0 + (1.0 - f0) * pow(1.0 - vDotH, 5.0);
    return distribution * geometryV * geometryL * fresnel
      / max(0.001, 4.0 * nDotV * nDotL) * nDotL;
  }

  float visibleSunDisc(vec3 direction) {
    // The visible emitter and the finite receiver light share one authored
    // angular diameter. A small feather prevents a sub-pixel hard edge while
    // preserving the difference between a 0.53° sun and a broad area study.
    float diameterDeg = clamp(uSunSize, 0.1, 30.0);
    float radius = radians(diameterDeg * 0.5);
    float feather = radians(clamp(diameterDeg * 0.025, 0.035, 0.35));
    float alignment = dot(normalize(direction), normalize(uLightDir));
    float outerCosine = cos(radius + feather);
    float innerCosine = cos(max(0.0, radius - feather));
    return smoothstep(outerCosine, innerCosine, alignment);
  }

  vec3 sunTransmission(vec3 origin, vec3 direction) {
    float travelled = 0.035;
    float insideDistance = 0.0;
    bool entered = false;
    bool exited = false;
    vec3 entryPoint = origin;
    vec3 exitPoint = origin;
    vec3 rayDirection = normalize(direction);
    for (int i = 0; i < 72; i++) {
      vec3 samplePoint = origin + rayDirection * travelled;
      float distance = map(samplePoint);
      if (!entered) {
        if (distance < 0.0035) {
          entered = true;
          entryPoint = samplePoint;
          travelled += 0.014;
          insideDistance += 0.014;
          continue;
        }
        travelled += max(0.025, distance * 0.72);
      } else {
        if (distance >= -0.002 && insideDistance > 0.025) {
          exited = true;
          exitPoint = samplePoint;
          break;
        }
        float stepDistance = max(0.012, abs(distance) * 0.58);
        travelled += stepDistance;
        insideDistance += stepDistance;
      }
      if (travelled > 14.0) break;
    }
    if (!entered) return vec3(1.0);
    if (!exited) return vec3(0.035, 0.045, 0.055);

    // Sampling the material field on every ray-march step made the fragment
    // shader too costly on some ANGLE/Windows drivers. Seven samples across
    // the completed inside segment preserve the heterogeneous optical depth
    // while keeping the loop's SDF work independent from procedural noise.
    float inclusionNear = 0.0;
    float inclusionFar = 0.0;
    float inclusionLength = 0.0;
    if (rayInclusionInterval(entryPoint, rayDirection, inclusionNear, inclusionFar)) {
      float intervalStart = clamp(inclusionNear, 0.0, insideDistance);
      float intervalEnd = clamp(inclusionFar, 0.0, insideDistance);
      inclusionLength = max(0.0, intervalEnd - intervalStart);
    }
    float hostLength = max(0.0, insideDistance - inclusionLength);
    float hostDensity = segmentMaterialDensity(entryPoint, exitPoint);
    vec3 opticalDepth = uHostAbsorptionRgb * hostLength * hostDensity
      + uInclusionAbsorptionRgb * inclusionLength;
    float interfaceTransmission = pow(normalInterfaceTransmission(1.0, uIor), 2.0);
    if (inclusionLength > 0.0001) {
      interfaceTransmission *= pow(
        normalInterfaceTransmission(uIor, uInclusionIor),
        2.0
      );
    }
    return exp(-opticalDepth) * interfaceTransmission;
  }

  vec3 finiteSunTransmission(vec3 origin) {
    vec3 lightDirection = normalize(uLightDir);
    vec3 helper = abs(lightDirection.y) < 0.92
      ? vec3(0.0, 1.0, 0.0)
      : vec3(1.0, 0.0, 0.0);
    vec3 basisU = normalize(cross(lightDirection, helper));
    vec3 basisV = normalize(cross(basisU, lightDirection));
    float diskRadius = tan(radians(max(0.1, uSunSize) * 0.5));

    vec3 centerTransmission = sunTransmission(origin, lightDirection);
    if (uCompatibilityMode == 1) {
      return centerTransmission;
    }
    vec3 horizontalTransmission = sunTransmission(
      origin,
      normalize(lightDirection + basisU * diskRadius)
    );
    horizontalTransmission += sunTransmission(
      origin,
      normalize(lightDirection - basisU * diskRadius)
    );
    if (uSunSize < 1.0) {
      return centerTransmission * 0.50 + horizontalTransmission * 0.25;
    }

    vec3 verticalTransmission = sunTransmission(
      origin,
      normalize(lightDirection + basisV * diskRadius)
    );
    verticalTransmission += sunTransmission(
      origin,
      normalize(lightDirection - basisV * diskRadius)
    );
    if (uSunSize < 4.0) {
      return centerTransmission * 0.28
        + (horizontalTransmission + verticalTransmission) * 0.18;
    }

    vec3 transmission = centerTransmission * 0.20
      + (horizontalTransmission + verticalTransmission) * 0.10;
    float diagonalRadius = diskRadius * 0.70710678;
    transmission += sunTransmission(
      origin,
      normalize(lightDirection + basisU * diagonalRadius + basisV * diagonalRadius)
    ) * 0.10;
    transmission += sunTransmission(
      origin,
      normalize(lightDirection + basisU * diagonalRadius - basisV * diagonalRadius)
    ) * 0.10;
    transmission += sunTransmission(
      origin,
      normalize(lightDirection - basisU * diagonalRadius + basisV * diagonalRadius)
    ) * 0.10;
    transmission += sunTransmission(
      origin,
      normalize(lightDirection - basisU * diagonalRadius - basisV * diagonalRadius)
    ) * 0.10;
    return transmission;
  }

  vec3 analysisEnvironment(vec3 origin, vec3 direction) {
    float horizon = smoothstep(-0.35, 0.45, direction.y);
    vec3 sky = mix(vec3(0.012, 0.025, 0.035), vec3(0.075, 0.16, 0.2), horizon);
    float lightBand = visibleSunDisc(direction);
    sky += vec3(0.72, 0.9, 1.0) * lightBand;

    float floorY = uReceiverY;
    if (direction.y < -0.001) {
      float floorDistance = (floorY - origin.y) / direction.y;
      if (floorDistance > 0.0) {
        vec3 floorPoint = origin + direction * floorDistance;
        float radial = exp(-0.055 * dot(floorPoint.xz, floorPoint.xz));
        float horizonGlow = pow(clamp(1.0 + direction.y, 0.0, 1.0), 3.0);
        vec3 floorColor = mix(vec3(0.01, 0.022, 0.028), vec3(0.025, 0.068, 0.078), radial);
        floorColor += vec3(0.018, 0.055, 0.064) * horizonGlow;
        return floorColor;
      }
    }
    return sky;
  }

  vec3 naturalEnvironment(vec3 origin, vec3 direction, bool includeSunShadow) {
    float skyHeight = smoothstep(-0.22, 0.72, direction.y);
    vec3 horizonColor = vec3(0.62, 0.78, 0.92);
    vec3 zenithColor = vec3(0.2, 0.48, 0.78);
    vec3 sky = mix(horizonColor, zenithColor, skyHeight) * uSkyIntensity;
    vec3 environmentDirection = rotateEnvironment(direction);
    float detailVisibility = 1.0 - uEnvironmentMist * 0.94;
    // The background is an infinite directional environment. Refraction
    // changes the lookup direction, never the apparent distance or horizon.
    float azimuth = atan(environmentDirection.z, environmentDirection.x);
    float environmentHeight = environmentDirection.y;
    float cloudField =
      sin(azimuth * 2.7 + environmentDirection.y * 8.0)
      + sin(azimuth * 5.3 - environmentDirection.y * 5.0) * 0.55
      + sin(azimuth * 11.0 + environmentDirection.y * 13.0) * 0.22;
    float cloudMask = smoothstep(
      0.52,
      1.22,
      cloudField + environmentDirection.y * 0.35
    ) * smoothstep(-0.02, 0.42, environmentDirection.y);
    vec3 cloudColor = mix(vec3(0.78, 0.84, 0.88), vec3(1.0, 0.97, 0.9), skyHeight);
    sky = mix(
      sky,
      cloudColor * uSkyIntensity,
      cloudMask * 0.42 * uEnvironmentContrast * detailVisibility
    );

    float treeHeight = 0.015
      + sin(azimuth * 4.0) * 0.022
      + sin(azimuth * 9.0 + 1.7) * 0.012
      + sin(azimuth * 21.0) * 0.006;
    float treeMask = smoothstep(-0.12, -0.025, environmentHeight)
      * (1.0 - smoothstep(treeHeight, treeHeight + 0.035, environmentHeight));
    vec3 treeColor = vec3(0.055, 0.095, 0.075) * (0.65 + 0.35 * uSkyIntensity);
    sky = mix(
      sky,
      treeColor,
      treeMask * min(1.0, uEnvironmentContrast * 0.78) * detailVisibility
    );

    float trunkField = sin(azimuth * 23.0 + sin(azimuth * 7.0) * 1.4)
      + sin(azimuth * 41.0 + 0.9) * 0.44;
    float trunkMask = smoothstep(1.12, 1.38, trunkField)
      * smoothstep(-0.09, -0.015, environmentHeight)
      * (1.0 - smoothstep(0.16, 0.31, environmentHeight));
    sky = mix(
      sky,
      vec3(0.032, 0.05, 0.038),
      trunkMask * min(1.0, uEnvironmentContrast * 0.92) * detailVisibility
    );

    float openingField = sin(azimuth * 6.0 - 0.7) + sin(azimuth * 13.0) * 0.28;
    float openingMask = smoothstep(0.88, 1.16, openingField)
      * smoothstep(-0.015, 0.035, environmentHeight)
      * (1.0 - smoothstep(0.035, 0.16, environmentHeight));
    sky += vec3(0.34, 0.24, 0.12)
      * openingMask
      * uSunIntensity
      * 0.28
      * uEnvironmentContrast
      * detailVisibility;

    float skyHaze = exp(-abs(direction.y) * 7.5) * uEnvironmentMist;
    vec3 hazeColor = vec3(0.69, 0.74, 0.76) * uSkyIntensity;
    sky = mix(sky, hazeColor, skyHaze * 0.74);

    float sunDisc = visibleSunDisc(direction);
    sky += vec3(1.0, 0.88, 0.66) * sunDisc * uSunIntensity * 1.8;

    float floorY = uReceiverY;
    float floorDistance = 1e5;
    if (direction.y < -0.001) {
      floorDistance = (floorY - origin.y) / direction.y;
      if (floorDistance <= 0.0) floorDistance = 1e5;
    }
    if (direction.y < -0.001) {
      if (floorDistance < 1e4) {
        vec3 floorPoint = origin + direction * floorDistance;
        vec3 legacyTransmission = includeSunShadow
          ? finiteSunTransmission(floorPoint + vec3(0.0, 0.015, 0.0))
          : vec3(0.72);
        float distanceFade = exp(-0.018 * dot(floorPoint.xz, floorPoint.xz));
        float groundField =
          sin(floorPoint.x * 0.58 + sin(floorPoint.z * 0.31))
          + sin(floorPoint.z * 0.77 - floorPoint.x * 0.19) * 0.48;
        float groundVariation = smoothstep(-1.15, 1.35, groundField);
        vec3 ground = mix(
          vec3(0.69, 0.68, 0.64),
          vec3(0.91, 0.87, 0.78),
          groundVariation
        ) * uGroundReflectance;
        vec2 receiverUv = (floorPoint.xz - uCausticBounds.xy) / uCausticBounds.zw;
        vec2 receiverLower = step(vec2(0.0), receiverUv);
        vec2 receiverUpper = step(receiverUv, vec2(1.0));
        float receiverInside = receiverLower.x * receiverLower.y
          * receiverUpper.x * receiverUpper.y;
        float pairedWeight = receiverInside * uCausticAvailable;
        vec4 receiverTransport = sampleReceiverTransport(receiverUv);
        float receiverCosine = max(abs(normalize(uLightDir).y), 0.0001);
        float removedBaseline = clamp(
          receiverTransport.a / receiverCosine,
          0.0,
          1.0
        );
        vec3 addedTransport = max(
          vec3(0.0),
          receiverTransport.rgb / receiverCosine
        );
        vec3 pairedDirect = vec3(1.0 - removedBaseline) + addedTransport;
        vec3 directTransport = mix(
          legacyTransmission,
          pairedDirect,
          pairedWeight
        );
        vec3 shadowTransmission = mix(
          legacyTransmission,
          vec3(1.0 - removedBaseline),
          pairedWeight
        );
        float transmissionLuma = dot(
          shadowTransmission,
          vec3(0.2126, 0.7152, 0.0722)
        );
        // A clear resin still removes part of the direct and hemispherical
        // light through its two interfaces. Keeping that broad loss separate
        // from the focused caustic makes a translucent shadow remain readable
        // underneath the bright pool instead of letting the pool erase it.
        float shadowPresence = smoothstep(
          0.015,
          0.30,
          1.0 - transmissionLuma
        );
        vec3 ambient = ground
          * (0.68 + 0.24 * uSkyIntensity)
          * (1.0 - shadowPresence * 0.24);
        // Reference transport replaces the same unobstructed direct-light
        // baseline that generated it. It is never an independent floor glow.
        vec3 direct = ground * uSunIntensity * directTransport * 0.42;
        vec3 horizonFill = vec3(0.08, 0.14, 0.18) * uSkyIntensity * (1.0 - distanceFade);
        vec3 floorColor = ambient + direct + horizonFill;
        if (uReceiverDisplayMode != 0 && pairedWeight > 0.0) {
          // Diagnostic false color belongs to the reconstructed shadow, not
          // to the rectangular receiver texture domain.
          float diagnosticMask = smoothstep(0.001, 0.035, removedBaseline);
          vec3 diagnosticColor = floorColor;
          if (uReceiverDisplayMode == 1) {
            float coverageTone = removedBaseline / (1.0 + removedBaseline);
            diagnosticColor = mix(
              vec3(0.025, 0.055, 0.075),
              vec3(1.0, 0.58, 0.12),
              coverageTone
            );
          } else if (uReceiverDisplayMode == 2) {
            vec3 depositTone = addedTransport / (vec3(1.0) + addedTransport);
            diagnosticColor = vec3(0.018, 0.035, 0.055) + depositTone * 1.35;
          } else {
            vec3 lossIrradiance = max(
              vec3(0.0),
              sampleReceiverLoss(receiverUv) / receiverCosine
            );
            vec3 lossTone = lossIrradiance / (vec3(1.0) + lossIrradiance);
            diagnosticColor = vec3(0.035, 0.025, 0.055)
              + lossTone * vec3(1.25, 0.52, 0.8);
          }
          floorColor = mix(floorColor, diagnosticColor, pairedWeight * diagnosticMask);
        }
        float fogDensity = mix(0.012, 0.085, uEnvironmentMist);
        float distanceFog = 1.0 - exp(-floorDistance * fogDensity);
        return mix(floorColor, sky, clamp(distanceFog, 0.0, 1.0));
      }
    }
    return sky;
  }

  vec3 opticalEnvironment(vec3 origin, vec3 direction) {
    return uNaturalView == 1
      ? naturalEnvironment(origin, direction, true)
      : analysisEnvironment(origin, direction);
  }

  vec3 roughEnvironmentSample(vec3 origin, vec3 direction) {
    return uNaturalView == 1
      ? naturalEnvironment(origin, direction, false)
      : analysisEnvironment(origin, direction);
  }

  vec3 roughOpticalEnvironment(vec3 origin, vec3 direction) {
    vec3 center = opticalEnvironment(origin, direction);
    if (uSurfaceRoughness < 0.015) return center;
    vec3 helper = abs(direction.y) < 0.92
      ? vec3(0.0, 1.0, 0.0)
      : vec3(1.0, 0.0, 0.0);
    vec3 basisU = normalize(cross(direction, helper));
    vec3 basisV = normalize(cross(basisU, direction));
    float spread = max(0.004, uSurfaceRoughness * uSurfaceRoughness * 0.82);
    if (uProgressiveLinearOutput == 1) {
      float index = float(uProgressiveSampleIndex + 1);
      float angleNoise = fract(sin(index * 12.9898) * 43758.5453);
      float radiusNoise = fract(sin(index * 78.233) * 43758.5453);
      float angle = angleNoise * 6.28318530718;
      float radius = sqrt(radiusNoise);
      vec2 disk = vec2(cos(angle), sin(angle)) * radius;
      vec3 roughSample = roughEnvironmentSample(
        origin,
        normalize(direction + (basisU * disk.x + basisV * disk.y) * spread)
      );
      float roughMix = uSurfaceRoughness < 0.18
        ? clamp(uSurfaceRoughness * 2.2, 0.0, 0.52)
        : clamp(uSurfaceRoughness * 1.75, 0.0, 0.9);
      return mix(center, roughSample, roughMix);
    }
    if (uCompatibilityMode == 1) return center;
    vec3 horizontal = roughEnvironmentSample(
      origin,
      normalize(direction + basisU * spread)
    );
    horizontal += roughEnvironmentSample(
      origin,
      normalize(direction - basisU * spread)
    );
    if (uSurfaceRoughness < 0.18) {
      vec3 blurred = horizontal * 0.5;
      return mix(center, blurred, clamp(uSurfaceRoughness * 2.2, 0.0, 0.52));
    }
    vec3 vertical = roughEnvironmentSample(
      origin,
      normalize(direction + basisV * spread)
    );
    vertical += roughEnvironmentSample(
      origin,
      normalize(direction - basisV * spread)
    );
    vec3 blurred = (horizontal + vertical) * 0.25;
    return mix(center, blurred, clamp(uSurfaceRoughness * 1.75, 0.0, 0.9));
  }

  vec3 outgoingAtIor(
    vec3 incoming,
    vec3 entryNormal,
    vec3 exitNormal,
    float ior,
    vec3 fallback
  ) {
    vec3 inside = refract(incoming, entryNormal, 1.0 / max(1.001, ior));
    if (length(inside) < 0.01) return fallback;
    vec3 outgoing = refract(inside, -exitNormal, ior);
    return length(outgoing) < 0.01 ? fallback : outgoing;
  }

  float spectralLuminance(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
  }

  vec3 fiveBandSpectrum(
    vec3 origin,
    vec3 incoming,
    vec3 entryNormal,
    vec3 exitNormal,
    vec3 centerDirection,
    vec3 centerColor,
    float spread
  ) {
    vec3 redDirection = outgoingAtIor(
      incoming,
      entryNormal,
      exitNormal,
      max(1.001, uIor - spread * 0.5),
      centerDirection
    );
    vec3 amberDirection = outgoingAtIor(
      incoming,
      entryNormal,
      exitNormal,
      max(1.001, uIor - spread * 0.24),
      centerDirection
    );
    vec3 cyanDirection = outgoingAtIor(
      incoming,
      entryNormal,
      exitNormal,
      uIor + spread * 0.25,
      centerDirection
    );
    vec3 blueDirection = outgoingAtIor(
      incoming,
      entryNormal,
      exitNormal,
      uIor + spread * 0.54,
      centerDirection
    );
    float red = spectralLuminance(roughEnvironmentSample(origin, redDirection));
    float amber = spectralLuminance(roughEnvironmentSample(origin, amberDirection));
    float green = spectralLuminance(centerColor);
    float cyan = spectralLuminance(roughEnvironmentSample(origin, cyanDirection));
    float blue = spectralLuminance(roughEnvironmentSample(origin, blueDirection));
    float meanBand = (red + amber + green + cyan + blue) * 0.2;
    float bandContrast = uDispersionMode == 1 ? 2.1 : 3.2;
    red = max(0.0, meanBand + (red - meanBand) * bandContrast);
    amber = max(0.0, meanBand + (amber - meanBand) * bandContrast);
    green = max(0.0, meanBand + (green - meanBand) * bandContrast);
    cyan = max(0.0, meanBand + (cyan - meanBand) * bandContrast);
    blue = max(0.0, meanBand + (blue - meanBand) * bandContrast);

    vec3 spectrum =
      red * vec3(1.0, 0.04, 0.0)
      + amber * vec3(1.0, 0.5, 0.01)
      + green * vec3(0.08, 1.0, 0.05)
      + cyan * vec3(0.0, 0.55, 1.0)
      + blue * vec3(0.05, 0.03, 1.0);
    vec3 normalization = vec3(2.13, 2.12, 2.06);
    return spectrum / normalization;
  }

  vec3 stressInterferenceColor(float retardance) {
    float violet = pow(sin(3.14159265 * retardance / 0.44), 2.0);
    float cyan = pow(sin(3.14159265 * retardance / 0.49), 2.0);
    float green = pow(sin(3.14159265 * retardance / 0.55), 2.0);
    float amber = pow(sin(3.14159265 * retardance / 0.59), 2.0);
    float red = pow(sin(3.14159265 * retardance / 0.65), 2.0);
    vec3 spectrum =
      violet * vec3(0.13, 0.08, 1.0)
      + cyan * vec3(0.0, 0.72, 1.0)
      + green * vec3(0.12, 1.0, 0.06)
      + amber * vec3(1.0, 0.58, 0.02)
      + red * vec3(1.0, 0.05, 0.01);
    return spectrum / 2.25;
  }

  vec3 opticalToneMap(vec3 color) {
    return vec3(1.0) - exp(-max(color, vec3(0.0)) * uOpticalExposure);
  }

  vec3 opticalOutput(vec3 color) {
    if (uProgressiveLinearOutput == 1) return max(color, vec3(0.0));
    vec3 outputColor = uNaturalView == 1 ? opticalToneMap(color) : color;
    if (uMonochrome == 1) {
      float luminance = dot(outputColor, vec3(0.2126, 0.7152, 0.0722));
      outputColor = vec3(luminance);
    }
    return outputColor;
  }

  bool marchInside(vec3 entry, vec3 direction, out vec3 exitPoint, out float travelled) {
    travelled = 0.018;
    vec3 previousPoint = entry;
    for (int i = 0; i < 144; i++) {
      exitPoint = entry + direction * travelled;
      float d = map(exitPoint);
      if (d >= -0.0015 && travelled > 0.04) {
        vec3 insidePoint = previousPoint;
        vec3 outsidePoint = exitPoint;
        for (int refinement = 0; refinement < 6; refinement++) {
          vec3 middle = mix(insidePoint, outsidePoint, 0.5);
          if (map(middle) < 0.0) insidePoint = middle;
          else outsidePoint = middle;
        }
        exitPoint = mix(insidePoint, outsidePoint, 0.5);
        return true;
      }
      previousPoint = exitPoint;
      travelled += max(0.012, abs(d) * 0.72);
      if (travelled > 16.0) break;
    }
    return false;
  }

  // Nearest ball index to a surface point, used only for the selection ring.
  int nearestBall(vec3 p) {
    float best = 1e5;
    int bestI = -1;
    for (int i = 0; i < ${MAX_BALLS}; i++) {
      if (i >= uBallCount) break;
      float bd = sdBall(p, uBallPos[i], uBallRadius[i]);
      if (bd < best) { best = bd; bestI = i; }
    }
    return bestI;
  }

  void main() {
    vec2 ndc = vUv * 2.0 - 1.0 + uPixelJitter * 2.0 / uResolution;
    vec4 clip = vec4(ndc, -1.0, 1.0);
    vec4 viewDir4 = uCamInverseProjection * clip;
    viewDir4 = vec4(viewDir4.xy, -1.0, 0.0);
    vec3 rd = normalize((uCamInverseView * viewDir4).xyz);
    vec3 ro = uCamPos;

    float t = 0.0;
    bool hit = false;
    vec3 p = ro;
    for (int i = 0; i < 128; i++) {
      p = ro + rd * t;
      float d = map(p);
      if (d < 0.001) { hit = true; break; }
      t += d;
      if (t > 50.0) break;
    }

    if (!hit || uBallCount == 0) {
      if (uRenderMode == 1) {
        vec3 environment = opticalEnvironment(ro, rd);
        gl_FragColor = vec4(opticalOutput(environment), 1.0);
        return;
      }
      // Soft vertical gradient background, not pure black — makes a
      // hollow ("no balls yet") state readable at a glance.
      float g = 0.5 + 0.5 * vUv.y;
      gl_FragColor = vec4(mix(vec3(0.055, 0.06, 0.075), vec3(0.09, 0.1, 0.12), g), 1.0);
      return;
    }

    vec3 n = estimateNormal(p);
    if (uRenderMode == 1) {
      // Keep cosmetic surface variation out of medium-boundary decisions.
      // Otherwise the shading noise invents broad TIR/unresolved islands.
      vec3 geometricNormal = n;
      n = perturbSurfaceNormal(n, p);
      float eta = 1.0 / max(1.001, uIor);
      vec3 insideDirection = refract(rd, geometricNormal, eta);
      bool entryResolved = length(insideDirection) >= 0.01;
      if (!entryResolved) insideDirection = reflect(rd, geometricNormal);
      vec3 exitPoint = p;
      float travelled = 0.0;
      bool hasExit = entryResolved
        && marchInside(p, insideDirection, exitPoint, travelled);
      float hostDistance = travelled;
      float inclusionDistance = 0.0;
      float nestedInterfaceTransmission = 1.0;
      bool traversedInclusion = false;
      vec3 finalHostDirection = insideDirection;

      // A nested interface contributes only when its complete path resolves.
      // The body view keeps the previously solved host path when it does not;
      // strict receiver transport still rejects the unresolved path separately.
      if (hasExit && uInclusionEnabled == 1) {
        float inclusionNear = 0.0;
        float inclusionFar = 0.0;
        bool intersectsInclusion = rayInclusionInterval(
          p,
          insideDirection,
          inclusionNear,
          inclusionFar
        );
        if (
          intersectsInclusion
          && inclusionNear > 0.012
          && inclusionNear < travelled - 0.012
        ) {
          if (inclusionFar >= travelled - 0.012) {
            // Keep the already solved outer-host path in the realtime view.
          } else {
            vec3 inclusionEntry = p + insideDirection * inclusionNear;
            vec3 inclusionEntryNormal = normalize(inclusionEntry - uInclusionCenter);
            vec3 inclusionDirection = refract(
              insideDirection,
              inclusionEntryNormal,
              uIor / max(1.0, uInclusionIor)
            );
            if (length(inclusionDirection) > 0.01) {
              vec3 inclusionStart = inclusionEntry + inclusionDirection * 0.006;
              float innerNear = 0.0;
              float innerFar = 0.0;
              if (rayInclusionInterval(inclusionStart, inclusionDirection, innerNear, innerFar)) {
                vec3 inclusionExit = inclusionStart + inclusionDirection * innerFar;
                vec3 inclusionExitNormal = normalize(inclusionExit - uInclusionCenter);
                vec3 returnedHostDirection = refract(
                  inclusionDirection,
                  -inclusionExitNormal,
                  uInclusionIor / max(1.001, uIor)
                );
                if (length(returnedHostDirection) > 0.01) {
                  vec3 returnedHostStart = inclusionExit + returnedHostDirection * 0.008;
                  vec3 nestedExitPoint = returnedHostStart;
                  float returnedHostDistance = 0.0;
                  bool hasNestedExit = marchInside(
                    returnedHostStart,
                    returnedHostDirection,
                    nestedExitPoint,
                    returnedHostDistance
                  );
                  if (hasNestedExit) {
                    traversedInclusion = true;
                    exitPoint = nestedExitPoint;
                    finalHostDirection = returnedHostDirection;
                    inclusionDistance = distance(inclusionEntry, inclusionExit);
                    hostDistance = inclusionNear + returnedHostDistance + 0.008;
                    travelled = hostDistance + inclusionDistance;
                    nestedInterfaceTransmission = pow(
                      normalInterfaceTransmission(uIor, uInclusionIor),
                      2.0
                    );
                  }
                }
              }
            }
          }
        }
      }

      vec3 outgoing = finalHostDirection;
      vec3 exitIncidentDirection = finalHostDirection;
      vec3 exitNormal = -n;
      bool hasTransmittedExit = false;
      if (hasExit) {
        vec3 exitGeometricNormal = estimateNormal(exitPoint);
        exitNormal = perturbSurfaceNormal(exitGeometricNormal, exitPoint);
        vec3 refractedOut = refract(finalHostDirection, -exitGeometricNormal, uIor);
        if (length(refractedOut) < 0.01) {
          // Resolve one real internal-reflection bounce before giving up. A
          // realtime TIR ray must not sample the outside as if it transmitted.
          vec3 tirDirection = reflect(finalHostDirection, -exitGeometricNormal);
          vec3 tirStart = exitPoint + tirDirection * 0.008;
          vec3 tirExitPoint = tirStart;
          float tirDistance = 0.0;
          bool hasTirExit = marchInside(
            tirStart,
            tirDirection,
            tirExitPoint,
            tirDistance
          );
          if (hasTirExit) {
            vec3 tirExitGeometricNormal = estimateNormal(tirExitPoint);
            vec3 tirRefractedOut = refract(
              tirDirection,
              -tirExitGeometricNormal,
              uIor
            );
            if (length(tirRefractedOut) >= 0.01) {
              outgoing = tirRefractedOut;
              exitIncidentDirection = tirDirection;
              exitPoint = tirExitPoint;
              exitNormal = perturbSurfaceNormal(
                tirExitGeometricNormal,
                tirExitPoint
              );
              hostDistance += tirDistance + 0.008;
              travelled = hostDistance + inclusionDistance;
              hasTransmittedExit = true;
            }
          }
        } else {
          outgoing = refractedOut;
          hasTransmittedExit = true;
        }
      }

      float facing = clamp(dot(-rd, n), 0.0, 1.0);
      float fresnelBase = pow((uIor - 1.0) / (uIor + 1.0), 2.0);
      float fresnel = fresnelBase + (1.0 - fresnelBase) * pow(1.0 - facing, 5.0);
      vec3 displayOutgoing = outgoing;
      if (hasTransmittedExit) {
        // Transport remains geometric, but the environment lookup keeps the
        // soft surface variation that made the earlier body view feel natural.
        vec3 cosmeticOutgoing = refract(
          exitIncidentDirection,
          -exitNormal,
          uIor
        );
        if (length(cosmeticOutgoing) >= 0.01) {
          displayOutgoing = cosmeticOutgoing;
        }
      }
      vec3 refractedColor = roughOpticalEnvironment(
        hasExit ? exitPoint : p,
        displayOutgoing
      );
      if (hasTransmittedExit && !traversedInclusion && uRainbowModel != 1 && uDispersion > 0.001) {
        float locality = 1.0;
        if (uDispersionMode == 1) {
          float bend = clamp(length(outgoing - rd) / 1.15, 0.0, 1.0);
          float normalTurn = 1.0 - abs(dot(n, exitNormal));
          float grazing = pow(1.0 - facing, 2.0);
          float localScore = bend * 0.56 + normalTurn * 0.68 + grazing * 0.16;
          locality = smoothstep(0.28, 0.66, localScore);
        }
        float spectralScale = uDispersionMode == 1 ? 0.046 : 0.060;
        float spectralSpread = uDispersion * spectralScale * locality;
        if (spectralSpread > 0.0002) {
          vec3 spectralColor = fiveBandSpectrum(
            exitPoint,
            rd,
            n,
            exitNormal,
            outgoing,
            refractedColor,
            spectralSpread
          );
          float spectralVisibility = clamp(
            spectralSpread / max(0.001, spectralScale) * 0.9,
            0.0,
            0.9
          );
          refractedColor = mix(refractedColor, spectralColor, spectralVisibility);
        }
      }
      if (hasTransmittedExit && !traversedInclusion && uRainbowModel != 0 && uStressAmount > 0.001) {
        vec3 middle = mix(p, exitPoint, 0.5);
        float junction = max(junctionStress(p), junctionStress(exitPoint));
        float thicknessStress = smoothstep(0.35, 3.2, travelled);
        float cureContrast = clamp(abs(materialPattern(middle) - 1.0), 0.0, 1.0);
        float stressField = clamp(
          junction * 0.72 + thicknessStress * 0.22 + cureContrast * 0.3,
          0.0,
          1.0
        );
        float retardance = uStressAmount
          * (0.12 + stressField * 1.65)
          * (0.55 + travelled * 0.24);
        vec3 interference = stressInterferenceColor(retardance);
        float stressVisibility = uPolarization
          * smoothstep(0.14, 0.78, stressField)
          * 0.82;
        vec3 stressedLight = refractedColor * 0.5 + interference * 0.92;
        refractedColor = mix(refractedColor, stressedLight, stressVisibility);
      }
      float absorptionScale = uNaturalView == 1 ? 0.34 : 1.0;
      float density = hasExit ? segmentMaterialDensity(p, exitPoint) : materialPattern(p);
      vec3 opticalDepth = uHostAbsorptionRgb * hostDistance * density
        + uInclusionAbsorptionRgb * inclusionDistance;
      vec3 transmission = exp(-opticalDepth * absorptionScale)
        * nestedInterfaceTransmission;
      vec3 reflectedColor = roughOpticalEnvironment(p, reflect(rd, n));
      float edgeGlow = pow(1.0 - facing, 2.2);
      // Realtime observation favors the earlier continuous transparent look.
      // After the bounded TIR bounce, any still-unresolved body-view pixel uses
      // the same smooth host-looking environment approximation as the original
      // view. Progressive Render will replace this approximation rather than
      // feeding it to strict receiver transport as energy.
      vec3 color = mix(refractedColor * transmission, reflectedColor, fresnel);
      color += uOpticalTint * edgeGlow * 0.22;
      float opticalDepthLuma = dot(opticalDepth, vec3(0.2126, 0.7152, 0.0722));
      float internalHaze = (1.0 - exp(-opticalDepthLuma * 0.22))
        * uMaterialVariation;
      color += uOpticalTint * internalHaze * 0.11;
      if (uInclusionStatus == 2 && uNaturalView == 0) {
        color = mix(color, vec3(0.9, 0.08, 0.32), edgeGlow * 0.22);
      }
      float highlight = min(
        6.0,
        ggxSpecular(n, normalize(-rd), normalize(uLightDir))
      );
      color += vec3(1.0, 0.94, 0.82) * highlight * uSunIntensity * 0.22;
      gl_FragColor = vec4(opticalOutput(color), 1.0);
      return;
    }

    float diff = max(dot(n, normalize(uLightDir)), 0.0);
    float rim = pow(1.0 - max(dot(n, -rd), 0.0), 2.0);
    vec3 base = vec3(0.86, 0.87, 0.9);
    vec3 color = base * (0.25 + 0.75 * diff) + rim * 0.15;

    if (uSelectedIndex >= 0 && nearestBall(p) == uSelectedIndex) {
      color = mix(color, vec3(1.0, 0.75, 0.2), 0.5);
    }

    gl_FragColor = vec4(color, 1.0);
  }
`;
