define(['./AxisAlignedBoundingBox-ff186ccc', './Transforms-40229881', './Matrix2-13178034', './Matrix3-315394f6', './defaultValue-0a909f67', './TerrainEncoding-833187da', './Math-2dbd6b93', './OrientedBoundingBox-04920dc7', './RuntimeError-06c93819', './WebMercatorProjection-13a90d41', './createTaskProcessorWorker', './Check-666ab1a0', './combine-ca22a614', './AttributeCompression-b646d393', './ComponentDatatype-f7b11d02', './WebGLConstants-a8cc3e8c', './EllipsoidTangentPlane-214683dc', './IntersectionTests-f6e6bd8a', './Plane-900aa728'], function (AxisAlignedBoundingBox, Transforms, Matrix2, Matrix3, defaultValue, TerrainEncoding, Math$1, OrientedBoundingBox, RuntimeError, WebMercatorProjection, createTaskProcessorWorker, Check, combine, AttributeCompression, ComponentDatatype, WebGLConstants, EllipsoidTangentPlane, IntersectionTests, Plane) {
  'use strict';

  var sizeOfUint16 = Uint16Array.BYTES_PER_ELEMENT;
  var sizeOfInt32 = Int32Array.BYTES_PER_ELEMENT;
  var sizeOfUint32 = Uint32Array.BYTES_PER_ELEMENT;
  var sizeOfFloat = Float32Array.BYTES_PER_ELEMENT;
  var sizeOfDouble = Float64Array.BYTES_PER_ELEMENT;
  function indexOfEpsilon(arr, elem, elemType) {
    elemType = defaultValue.defaultValue(elemType, Math$1.CesiumMath);
    var count = arr.length;
    for (var i = 0; i < count; ++i) {
      if (elemType.equalsEpsilon(arr[i], elem, Math$1.CesiumMath.EPSILON12)) {
        return i;
      }
    }
    return -1;
  }
  function createVerticesFromGoogleEarthEnterpriseBuffer(parameters, transferableObjects) {
    parameters.ellipsoid = Matrix3.Ellipsoid.clone(parameters.ellipsoid);
    parameters.rectangle = Matrix2.Rectangle.clone(parameters.rectangle);
    var statistics = processBuffer(parameters.buffer, parameters.relativeToCenter, parameters.ellipsoid, parameters.rectangle, parameters.nativeRectangle, parameters.exaggeration, parameters.exaggerationRelativeHeight, parameters.skirtHeight, parameters.includeWebMercatorT, parameters.negativeAltitudeExponentBias, parameters.negativeElevationThreshold);
    var vertices = statistics.vertices;
    transferableObjects.push(vertices.buffer);
    var indices = statistics.indices;
    transferableObjects.push(indices.buffer);
    return {
      vertices: vertices.buffer,
      indices: indices.buffer,
      numberOfAttributes: statistics.encoding.stride,
      minimumHeight: statistics.minimumHeight,
      maximumHeight: statistics.maximumHeight,
      boundingSphere3D: statistics.boundingSphere3D,
      orientedBoundingBox: statistics.orientedBoundingBox,
      occludeePointInScaledSpace: statistics.occludeePointInScaledSpace,
      encoding: statistics.encoding,
      vertexCountWithoutSkirts: statistics.vertexCountWithoutSkirts,
      indexCountWithoutSkirts: statistics.indexCountWithoutSkirts,
      westIndicesSouthToNorth: statistics.westIndicesSouthToNorth,
      southIndicesEastToWest: statistics.southIndicesEastToWest,
      eastIndicesNorthToSouth: statistics.eastIndicesNorthToSouth,
      northIndicesWestToEast: statistics.northIndicesWestToEast
    };
  }
  var scratchCartographic = new Matrix3.Cartographic();
  var scratchCartesian = new Matrix3.Cartesian3();
  var minimumScratch = new Matrix3.Cartesian3();
  var maximumScratch = new Matrix3.Cartesian3();
  var matrix4Scratch = new Matrix2.Matrix4();
  function processBuffer(buffer, relativeToCenter, ellipsoid, rectangle, nativeRectangle, exaggeration, exaggerationRelativeHeight, skirtHeight, includeWebMercatorT, negativeAltitudeExponentBias, negativeElevationThreshold) {
    var geographicWest;
    var geographicSouth;
    var geographicEast;
    var geographicNorth;
    var rectangleWidth, rectangleHeight;
    if (!defaultValue.defined(rectangle)) {
      geographicWest = Math$1.CesiumMath.toRadians(nativeRectangle.west);
      geographicSouth = Math$1.CesiumMath.toRadians(nativeRectangle.south);
      geographicEast = Math$1.CesiumMath.toRadians(nativeRectangle.east);
      geographicNorth = Math$1.CesiumMath.toRadians(nativeRectangle.north);
      rectangleWidth = Math$1.CesiumMath.toRadians(rectangle.width);
      rectangleHeight = Math$1.CesiumMath.toRadians(rectangle.height);
    } else {
      geographicWest = rectangle.west;
      geographicSouth = rectangle.south;
      geographicEast = rectangle.east;
      geographicNorth = rectangle.north;
      rectangleWidth = rectangle.width;
      rectangleHeight = rectangle.height;
    }

    // Keep track of quad borders so we can remove duplicates around the borders
    var quadBorderLatitudes = [geographicSouth, geographicNorth];
    var quadBorderLongitudes = [geographicWest, geographicEast];
    var fromENU = Transforms.Transforms.eastNorthUpToFixedFrame(relativeToCenter, ellipsoid);
    var toENU = Matrix2.Matrix4.inverseTransformation(fromENU, matrix4Scratch);
    var southMercatorY;
    var oneOverMercatorHeight;
    if (includeWebMercatorT) {
      southMercatorY = WebMercatorProjection.WebMercatorProjection.geodeticLatitudeToMercatorAngle(geographicSouth);
      oneOverMercatorHeight = 1.0 / (WebMercatorProjection.WebMercatorProjection.geodeticLatitudeToMercatorAngle(geographicNorth) - southMercatorY);
    }
    var hasExaggeration = exaggeration !== 1.0;
    var includeGeodeticSurfaceNormals = hasExaggeration;
    var dv = new DataView(buffer);
    var minHeight = Number.POSITIVE_INFINITY;
    var maxHeight = Number.NEGATIVE_INFINITY;
    var minimum = minimumScratch;
    minimum.x = Number.POSITIVE_INFINITY;
    minimum.y = Number.POSITIVE_INFINITY;
    minimum.z = Number.POSITIVE_INFINITY;
    var maximum = maximumScratch;
    maximum.x = Number.NEGATIVE_INFINITY;
    maximum.y = Number.NEGATIVE_INFINITY;
    maximum.z = Number.NEGATIVE_INFINITY;

    // Compute sizes
    var offset = 0;
    var size = 0;
    var indicesSize = 0;
    var quadSize;
    var quad;
    for (quad = 0; quad < 4; ++quad) {
      var o = offset;
      quadSize = dv.getUint32(o, true);
      o += sizeOfUint32;
      var x = Math$1.CesiumMath.toRadians(dv.getFloat64(o, true) * 180.0);
      o += sizeOfDouble;
      if (indexOfEpsilon(quadBorderLongitudes, x) === -1) {
        quadBorderLongitudes.push(x);
      }
      var y = Math$1.CesiumMath.toRadians(dv.getFloat64(o, true) * 180.0);
      o += sizeOfDouble;
      if (indexOfEpsilon(quadBorderLatitudes, y) === -1) {
        quadBorderLatitudes.push(y);
      }
      o += 2 * sizeOfDouble; // stepX + stepY

      var c = dv.getInt32(o, true); // Read point count
      o += sizeOfInt32;
      size += c;
      c = dv.getInt32(o, true); // Read index count
      indicesSize += c * 3;
      offset += quadSize + sizeOfUint32; // Jump to next quad
    }

    // Quad Border points to remove duplicates
    var quadBorderPoints = [];
    var quadBorderIndices = [];

    // Create arrays
    var positions = new Array(size);
    var uvs = new Array(size);
    var heights = new Array(size);
    var webMercatorTs = includeWebMercatorT ? new Array(size) : [];
    var geodeticSurfaceNormals = includeGeodeticSurfaceNormals ? new Array(size) : [];
    var indices = new Array(indicesSize);

    // Points are laid out in rows starting at SW, so storing border points as we
    //  come across them all points will be adjacent.
    var westBorder = [];
    var southBorder = [];
    var eastBorder = [];
    var northBorder = [];

    // Each tile is split into 4 parts
    var pointOffset = 0;
    var indicesOffset = 0;
    offset = 0;
    for (quad = 0; quad < 4; ++quad) {
      quadSize = dv.getUint32(offset, true);
      offset += sizeOfUint32;
      var startQuad = offset;
      var originX = Math$1.CesiumMath.toRadians(dv.getFloat64(offset, true) * 180.0);
      offset += sizeOfDouble;
      var originY = Math$1.CesiumMath.toRadians(dv.getFloat64(offset, true) * 180.0);
      offset += sizeOfDouble;
      var stepX = Math$1.CesiumMath.toRadians(dv.getFloat64(offset, true) * 180.0);
      var halfStepX = stepX * 0.5;
      offset += sizeOfDouble;
      var stepY = Math$1.CesiumMath.toRadians(dv.getFloat64(offset, true) * 180.0);
      var halfStepY = stepY * 0.5;
      offset += sizeOfDouble;
      var numPoints = dv.getInt32(offset, true);
      offset += sizeOfInt32;
      var numFaces = dv.getInt32(offset, true);
      offset += sizeOfInt32;

      //const level = dv.getInt32(offset, true);
      offset += sizeOfInt32;

      // Keep track of quad indices to overall tile indices
      var indicesMapping = new Array(numPoints);
      for (var i = 0; i < numPoints; ++i) {
        var longitude = originX + dv.getUint8(offset++) * stepX;
        scratchCartographic.longitude = longitude;
        var latitude = originY + dv.getUint8(offset++) * stepY;
        scratchCartographic.latitude = latitude;
        var height = dv.getFloat32(offset, true);
        offset += sizeOfFloat;

        // In order to support old clients, negative altitude values are stored as
        // height/-2^32. Old clients see the value as really close to 0 but new clients multiply
        // by -2^32 to get the real negative altitude value.
        if (height !== 0 && height < negativeElevationThreshold) {
          height *= -Math.pow(2, negativeAltitudeExponentBias);
        }

        // Height is stored in units of (1/EarthRadius) or (1/6371010.0)
        height *= 6371010.0;
        scratchCartographic.height = height;

        // Is it along a quad border - if so check if already exists and use that index
        if (indexOfEpsilon(quadBorderLongitudes, longitude) !== -1 || indexOfEpsilon(quadBorderLatitudes, latitude) !== -1) {
          var index = indexOfEpsilon(quadBorderPoints, scratchCartographic, Matrix3.Cartographic);
          if (index === -1) {
            quadBorderPoints.push(Matrix3.Cartographic.clone(scratchCartographic));
            quadBorderIndices.push(pointOffset);
          } else {
            indicesMapping[i] = quadBorderIndices[index];
            continue;
          }
        }
        indicesMapping[i] = pointOffset;
        if (Math.abs(longitude - geographicWest) < halfStepX) {
          westBorder.push({
            index: pointOffset,
            cartographic: Matrix3.Cartographic.clone(scratchCartographic)
          });
        } else if (Math.abs(longitude - geographicEast) < halfStepX) {
          eastBorder.push({
            index: pointOffset,
            cartographic: Matrix3.Cartographic.clone(scratchCartographic)
          });
        } else if (Math.abs(latitude - geographicSouth) < halfStepY) {
          southBorder.push({
            index: pointOffset,
            cartographic: Matrix3.Cartographic.clone(scratchCartographic)
          });
        } else if (Math.abs(latitude - geographicNorth) < halfStepY) {
          northBorder.push({
            index: pointOffset,
            cartographic: Matrix3.Cartographic.clone(scratchCartographic)
          });
        }
        minHeight = Math.min(height, minHeight);
        maxHeight = Math.max(height, maxHeight);
        heights[pointOffset] = height;
        var pos = ellipsoid.cartographicToCartesian(scratchCartographic);
        positions[pointOffset] = pos;
        if (includeWebMercatorT) {
          webMercatorTs[pointOffset] = (WebMercatorProjection.WebMercatorProjection.geodeticLatitudeToMercatorAngle(latitude) - southMercatorY) * oneOverMercatorHeight;
        }
        if (includeGeodeticSurfaceNormals) {
          var normal = ellipsoid.geodeticSurfaceNormal(pos);
          geodeticSurfaceNormals[pointOffset] = normal;
        }
        Matrix2.Matrix4.multiplyByPoint(toENU, pos, scratchCartesian);
        Matrix3.Cartesian3.minimumByComponent(scratchCartesian, minimum, minimum);
        Matrix3.Cartesian3.maximumByComponent(scratchCartesian, maximum, maximum);
        var u = (longitude - geographicWest) / (geographicEast - geographicWest);
        u = Math$1.CesiumMath.clamp(u, 0.0, 1.0);
        var v = (latitude - geographicSouth) / (geographicNorth - geographicSouth);
        v = Math$1.CesiumMath.clamp(v, 0.0, 1.0);
        uvs[pointOffset] = new Matrix2.Cartesian2(u, v);
        ++pointOffset;
      }
      var facesElementCount = numFaces * 3;
      for (var j = 0; j < facesElementCount; ++j, ++indicesOffset) {
        indices[indicesOffset] = indicesMapping[dv.getUint16(offset, true)];
        offset += sizeOfUint16;
      }
      if (quadSize !== offset - startQuad) {
        throw new RuntimeError.RuntimeError("Invalid terrain tile.");
      }
    }
    positions.length = pointOffset;
    uvs.length = pointOffset;
    heights.length = pointOffset;
    if (includeWebMercatorT) {
      webMercatorTs.length = pointOffset;
    }
    if (includeGeodeticSurfaceNormals) {
      geodeticSurfaceNormals.length = pointOffset;
    }
    var vertexCountWithoutSkirts = pointOffset;
    var indexCountWithoutSkirts = indicesOffset;

    // Add skirt points
    var skirtOptions = {
      hMin: minHeight,
      lastBorderPoint: undefined,
      skirtHeight: skirtHeight,
      toENU: toENU,
      ellipsoid: ellipsoid,
      minimum: minimum,
      maximum: maximum
    };

    // Sort counter clockwise from NW corner
    // Corner points are in the east/west arrays
    westBorder.sort(function (a, b) {
      return b.cartographic.latitude - a.cartographic.latitude;
    });
    southBorder.sort(function (a, b) {
      return a.cartographic.longitude - b.cartographic.longitude;
    });
    eastBorder.sort(function (a, b) {
      return a.cartographic.latitude - b.cartographic.latitude;
    });
    northBorder.sort(function (a, b) {
      return b.cartographic.longitude - a.cartographic.longitude;
    });
    var percentage = 0.00001;
    addSkirt(positions, heights, uvs, webMercatorTs, geodeticSurfaceNormals, indices, skirtOptions, westBorder, -percentage * rectangleWidth, true, -percentage * rectangleHeight);
    addSkirt(positions, heights, uvs, webMercatorTs, geodeticSurfaceNormals, indices, skirtOptions, southBorder, -percentage * rectangleHeight, false);
    addSkirt(positions, heights, uvs, webMercatorTs, geodeticSurfaceNormals, indices, skirtOptions, eastBorder, percentage * rectangleWidth, true, percentage * rectangleHeight);
    addSkirt(positions, heights, uvs, webMercatorTs, geodeticSurfaceNormals, indices, skirtOptions, northBorder, percentage * rectangleHeight, false);

    // Since the corner between the north and west sides is in the west array, generate the last
    //  two triangles between the last north vertex and the first west vertex
    if (westBorder.length > 0 && northBorder.length > 0) {
      var firstBorderIndex = westBorder[0].index;
      var firstSkirtIndex = vertexCountWithoutSkirts;
      var lastBorderIndex = northBorder[northBorder.length - 1].index;
      var lastSkirtIndex = positions.length - 1;
      indices.push(lastBorderIndex, lastSkirtIndex, firstSkirtIndex, firstSkirtIndex, firstBorderIndex, lastBorderIndex);
    }
    size = positions.length; // Get new size with skirt vertices

    var boundingSphere3D = Transforms.BoundingSphere.fromPoints(positions);
    var orientedBoundingBox;
    if (defaultValue.defined(rectangle)) {
      orientedBoundingBox = OrientedBoundingBox.OrientedBoundingBox.fromRectangle(rectangle, minHeight, maxHeight, ellipsoid);
    }
    var occluder = new TerrainEncoding.EllipsoidalOccluder(ellipsoid);
    var occludeePointInScaledSpace = occluder.computeHorizonCullingPointPossiblyUnderEllipsoid(relativeToCenter, positions, minHeight);
    var aaBox = new AxisAlignedBoundingBox.AxisAlignedBoundingBox(minimum, maximum, relativeToCenter);
    var encoding = new TerrainEncoding.TerrainEncoding(relativeToCenter, aaBox, skirtOptions.hMin, maxHeight, fromENU, false, includeWebMercatorT, includeGeodeticSurfaceNormals, exaggeration, exaggerationRelativeHeight);
    var vertices = new Float32Array(size * encoding.stride);
    var bufferIndex = 0;
    for (var k = 0; k < size; ++k) {
      bufferIndex = encoding.encode(vertices, bufferIndex, positions[k], uvs[k], heights[k], undefined, webMercatorTs[k], geodeticSurfaceNormals[k]);
    }
    var westIndicesSouthToNorth = westBorder.map(function (vertex) {
      return vertex.index;
    }).reverse();
    var southIndicesEastToWest = southBorder.map(function (vertex) {
      return vertex.index;
    }).reverse();
    var eastIndicesNorthToSouth = eastBorder.map(function (vertex) {
      return vertex.index;
    }).reverse();
    var northIndicesWestToEast = northBorder.map(function (vertex) {
      return vertex.index;
    }).reverse();
    southIndicesEastToWest.unshift(eastIndicesNorthToSouth[eastIndicesNorthToSouth.length - 1]);
    southIndicesEastToWest.push(westIndicesSouthToNorth[0]);
    northIndicesWestToEast.unshift(westIndicesSouthToNorth[westIndicesSouthToNorth.length - 1]);
    northIndicesWestToEast.push(eastIndicesNorthToSouth[0]);
    return {
      vertices: vertices,
      indices: new Uint16Array(indices),
      maximumHeight: maxHeight,
      minimumHeight: minHeight,
      encoding: encoding,
      boundingSphere3D: boundingSphere3D,
      orientedBoundingBox: orientedBoundingBox,
      occludeePointInScaledSpace: occludeePointInScaledSpace,
      vertexCountWithoutSkirts: vertexCountWithoutSkirts,
      indexCountWithoutSkirts: indexCountWithoutSkirts,
      westIndicesSouthToNorth: westIndicesSouthToNorth,
      southIndicesEastToWest: southIndicesEastToWest,
      eastIndicesNorthToSouth: eastIndicesNorthToSouth,
      northIndicesWestToEast: northIndicesWestToEast
    };
  }
  function addSkirt(positions, heights, uvs, webMercatorTs, geodeticSurfaceNormals, indices, skirtOptions, borderPoints, fudgeFactor, eastOrWest, cornerFudge) {
    var count = borderPoints.length;
    for (var j = 0; j < count; ++j) {
      var borderPoint = borderPoints[j];
      var borderCartographic = borderPoint.cartographic;
      var borderIndex = borderPoint.index;
      var currentIndex = positions.length;
      var longitude = borderCartographic.longitude;
      var latitude = borderCartographic.latitude;
      latitude = Math$1.CesiumMath.clamp(latitude, -Math$1.CesiumMath.PI_OVER_TWO, Math$1.CesiumMath.PI_OVER_TWO); // Don't go over the poles
      var height = borderCartographic.height - skirtOptions.skirtHeight;
      skirtOptions.hMin = Math.min(skirtOptions.hMin, height);
      Matrix3.Cartographic.fromRadians(longitude, latitude, height, scratchCartographic);

      // Adjust sides to angle out
      if (eastOrWest) {
        scratchCartographic.longitude += fudgeFactor;
      }

      // Adjust top or bottom to angle out
      // Since corners are in the east/west arrays angle the first and last points as well
      if (!eastOrWest) {
        scratchCartographic.latitude += fudgeFactor;
      } else if (j === count - 1) {
        scratchCartographic.latitude += cornerFudge;
      } else if (j === 0) {
        scratchCartographic.latitude -= cornerFudge;
      }
      var pos = skirtOptions.ellipsoid.cartographicToCartesian(scratchCartographic);
      positions.push(pos);
      heights.push(height);
      uvs.push(Matrix2.Cartesian2.clone(uvs[borderIndex])); // Copy UVs from border point
      if (webMercatorTs.length > 0) {
        webMercatorTs.push(webMercatorTs[borderIndex]);
      }
      if (geodeticSurfaceNormals.length > 0) {
        geodeticSurfaceNormals.push(geodeticSurfaceNormals[borderIndex]);
      }
      Matrix2.Matrix4.multiplyByPoint(skirtOptions.toENU, pos, scratchCartesian);
      var minimum = skirtOptions.minimum;
      var maximum = skirtOptions.maximum;
      Matrix3.Cartesian3.minimumByComponent(scratchCartesian, minimum, minimum);
      Matrix3.Cartesian3.maximumByComponent(scratchCartesian, maximum, maximum);
      var lastBorderPoint = skirtOptions.lastBorderPoint;
      if (defaultValue.defined(lastBorderPoint)) {
        var lastBorderIndex = lastBorderPoint.index;
        indices.push(lastBorderIndex, currentIndex - 1, currentIndex, currentIndex, borderIndex, lastBorderIndex);
      }
      skirtOptions.lastBorderPoint = borderPoint;
    }
  }
  var createVerticesFromGoogleEarthEnterpriseBuffer$1 = createTaskProcessorWorker(createVerticesFromGoogleEarthEnterpriseBuffer);
  return createVerticesFromGoogleEarthEnterpriseBuffer$1;
});