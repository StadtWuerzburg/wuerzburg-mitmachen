(function() {
  "use strict";
  App.Map = {
    maps: [],
    initialize: function() {
      $("*[data-map]:visible").each(function() {
        App.Map.initializeMap(this);
      });
    },
    destroy: function() {
      App.Map.maps.forEach(function(map) {
        map.off();
        map.remove();
      });
      App.Map.maps = [];
    },
    initializeMap: function(element) {
      var clearFormfields, createMarker, editable, getPopupContent, latitudeInputSelector, longitudeInputSelector, mapUserShape, mapAdminShape, map, mapAttribution, mapCenterLatLng, mapCenterLatitude, mapCenterLongitude, mapTilesProvider, marker, markerIcon, markerLatitude, markerLongitude, markerColor, markerIconClass, moveOrPlaceMarker, openMarkerPopup, removeMarker, removeMarkerSelector, updateFormfields, zoom, zoomInputSelector, shapeInputSelector, process, markersGroup, layersData;

      var addMarker = $(element).data("marker-process-coordinates");

      process = $(element).data("parent-class");
      App.Map.cleanCoordinates(element);
      mapCenterLatitude = $(element).data("map-center-latitude");
      mapCenterLongitude = $(element).data("map-center-longitude");
      mapUserShape = $(element).data("map-user-shape");
      mapAdminShape = $(element).data("map-admin-shape");
      markerLatitude = $(element).data("marker-latitude");
      markerLongitude = $(element).data("marker-longitude");
      markerColor = $(element).data("marker-color");
      markerIconClass = $(element).data("marker-fa-icon-class")
      zoom = $(element).data("map-zoom");
      mapTilesProvider = $(element).data("map-tiles-provider");
      mapAttribution = $(element).data("map-tiles-provider-attribution");
      latitudeInputSelector = $(element).data("latitude-input-selector");
      longitudeInputSelector = $(element).data("longitude-input-selector");
      zoomInputSelector = $(element).data("zoom-input-selector");
      shapeInputSelector = $(element).data("shape-input-selector");
      removeMarkerSelector = $(element).data("marker-remove-selector");
      editable = $(element).data("marker-editable");
      marker = null;
      markersGroup = L.markerClusterGroup();

      layersData = $(element).data('map-layers');

      var adminShapesColor = 'red';

      createMarker = function(latitude, longitude, color, iconClass) {
        if ( !iconClass ) {
          iconClass = 'circle';
        } else {
          iconClass = iconClass
        };

        var markerLatLng;
        markerLatLng = new L.LatLng(latitude, longitude);

        markerIcon = L.divIcon({
          className: "map-marker",
          iconSize: [30, 30],
          iconAnchor: [15, 40]
        });

        if ( color ) {
          markerIcon.options.html = '<div class="map-icon icon-' + iconClass + '" style="background-color: ' + color + '"></div>'
        } else {
          markerIcon.options.html = '<div class="map-icon icon-' + iconClass + '"></div>'
        }

        marker = L.marker(markerLatLng, {
          icon: markerIcon,
          draggable: editable
        });

        if (editable) {
          marker.on("dragend", updateFormfields);
          marker.addTo(map);
        } else {
          markersGroup.addLayer(marker);
        }

        return marker;
      };

      removeMarker = function(e) {
        e.preventDefault();
        if (marker) {
          map.removeLayer(marker);
          marker = null;
        }
        clearFormfields();
      };

      moveOrPlaceMarker = function(e) {
        if (marker) {
          marker.setLatLng(e.latlng);
        } else {
          marker = createMarker(e.latlng.lat, e.latlng.lng);
        }
        updateFormfields();
      };

      updateFormfields = function() {
        $(latitudeInputSelector).val(marker.getLatLng().lat);
        $(longitudeInputSelector).val(marker.getLatLng().lng);
        $(zoomInputSelector).val(map.getZoom());
      };

      clearFormfields = function() {
        $(latitudeInputSelector).val("");
        $(longitudeInputSelector).val("");
        $(zoomInputSelector).val("");
      };

      openMarkerPopup = function(e) {
        var route;

        if ( process == "proposals" ) {
          route = "/proposals/" + e.target.options.id + "/json_data"
        } else if ( process == "deficiency-reports") {
          route = "/deficiency_reports/" + e.target.options.id + "/json_data"
        } else if ( process == "projekts") {
          if (e.target.options.proposal_id) {
            route = "/proposals/" + e.target.options.proposal_id + "/json_data"
          }
          else {
            route = "/projekts/" + e.target.options.id + "/json_data"
          }
        } else {
          route = "/investments/" + e.target.options.id + "/json_data"
        }

        marker = e.target;
          $.ajax(route, {
            type: "GET",
            dataType: "json",
            success: function(data) {
            e.target.bindPopup(getPopupContent(data)).openPopup();
          }
        });
      };

      // TODO: add projekts link
      getPopupContent = function(data) {
        if (process == "proposals" || data.proposal_id) {
          return "<a href='/proposals/" + data.proposal_id + "'>" + data.proposal_title + "</a>";
        } else if ( process == "deficiency-reports" ) {
          return "<a href='/deficiency_reports/" + data.deficiency_report_id + "'>" + data.deficiency_report_title + "</a>";
        } else if ( process == "projekts" ) {
          return "<a href='/projekts/" + data.projekt_id + "'>" + data.projekt_title + "</a>";
        } else {
          return "<a href='/budgets/" + data.budget_id + "/investments/" + data.investment_id + "'>" + data.investment_title + "</a>";
        }
      };

      mapCenterLatLng = new L.LatLng(mapCenterLatitude, mapCenterLongitude);

      map = L.map(element.id, {
        gestureHandling: true,
        maxZoom: 18
      }).setView(mapCenterLatLng, zoom);


      // geoman
      // set colors
      map.pm.setPathOptions({
        color: adminShapesColor,
        fillColor: adminShapesColor,
        fillOpacity: 0.4,
      });
      map.pm.setGlobalOptions({
        templineStyle: { color: adminShapesColor },
        hintlineStyle: { color: adminShapesColor, dashArray: [5, 5]  }
      })

      if ( editable ) {
        // remove unnecessary controls
        map.pm.addControls({
          drawMarker: false,
          drawCircleMarker: false,
          drawText: false,
          removalMode: false
        });

        // add consul marker to geoman controls
        map.pm.Toolbar.createCustomControl({
          name: 'consulMarker',
          className: 'control-icon leaflet-pm-icon-marker',
          title: 'Drop Marker',
          block: 'draw',
          onClick: function() {
            removeShapesAndMarkers();

            if (this.toggleStatus) {
              map.off("click", moveOrPlaceMarker);
            } else {
              map.on("click", moveOrPlaceMarker);
            }
          }
        });

        // add remove consul marker to geoman controls
        map.pm.Toolbar.createCustomControl({
          name: 'clearMap',
          className: 'control-icon leaflet-pm-icon-delete',
          title: 'Clear Map',
          block: 'edit',
          onClick: function() {
            removeShapesAndMarkers();
            map.off("click", moveOrPlaceMarker);
            map.pm.Toolbar.toggleButton('clearMap', true);
          },
        });

        // toggle consul marker button by default
        map.pm.Toolbar.toggleButton('consulMarker', true)
        map.on("click", moveOrPlaceMarker);

        // reorder geoman controls
        map.pm.Toolbar.changeControlOrder([
          'consulMarker'
        ]);

        // remove past elements when new element is started
        map.on('pm:drawstart', function(e) {
          if (e.shape == 'Cut') {
            return
          }
          removeShapesAndMarkers();
        });

        // function to clear previously created shapes (only one shaped allowed)
        function removeShapesAndMarkers() {
          if (marker) {
            map.removeLayer(marker);
            marker = null;
          }

          map.pm.getGeomanLayers().forEach(function(layer) {
            layer.remove();
          })
        }

        // save shape to form
        map.on('pm:create', function(e) {
          var layer = e.layer;
          console.log('pm:create')
          updateShapeFieldInForm(layer);

          layer.on('pm:edit', function(e) {
            console.log('pm:edit')
            updateShapeFieldInForm(e.layer);
          })

          // allows multiple cuts
          layer.on('pm:cut', function(e) {
            if (typeof(e.layer.getLatLngs) == 'function') {
              e.originalLayer.setLatLngs(e.layer.getLatLngs());
              e.originalLayer.addTo(map);
              e.originalLayer._pmTempLayer = false;

              e.layer._pmTempLayer = true;
              e.layer.remove();
            }
          })
        })

        // update shape field in form
        var updateShapeFieldInForm = function(layer) {
          var shape = layer.toGeoJSON();
          var shapeString = JSON.stringify(shape);
          console.log(shapeString);
          $(shapeInputSelector).val(shapeString);
        };
      }
 
      // set positions for geoman controls
      map.pm.Toolbar.setBlockPosition('draw', 'topright');
      map.pm.Toolbar.setBlockPosition('edit', 'bottomright');

      // render shape created by admin
      if (mapAdminShape && Object.keys(mapAdminShape).length > 0) {
        var adminShapeLayer = L.geoJSON(mapAdminShape);
        adminShapeLayer.pm.ignore = true;
        adminShapeLayer.setStyle({
          color: adminShapesColor,
          fillColor: adminShapesColor,
          fillOpacity: 0.4,
        })
        adminShapeLayer.addTo(map);
        // map.fitBounds(layer.getBounds());
      }

      if ( !editable ) {
        map._layersMaxZoom = 19;
        map.addLayer(markersGroup);
      }

      App.Map.maps.push(map);



///

      var baseLayers = {};
      var overlayLayers = {};

      var createLayer = function(item, index) {

        if ( item.protocol == 'wms' ) {
          var layer = L.tileLayer.wms(item.provider, {
            attribution: item.attribution,
            layers: item.layer_names,
            format: (item.transparent ? 'image/png' : 'image/jpeg'),
            transparent: (item.transparent),
            show_by_default: (item.show_by_default)
          });

        } else {
          var layer = L.tileLayer(item.provider, {
            attribution: item.attribution
          });

        }

        if ( item.base ) {
          baseLayers[item.name] = layer;
        } else {
          overlayLayers[item.name] = layer;
        }
      }

      var ensureBaseLayerExistence = function() {
        if ( Object.keys(baseLayers).length === 0 ) {
          var defaultLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href=\"http://osm.org/copyright\">OpenStreetMap</a> contributors'
          });

          baseLayers['defaultLayer'] = defaultLayer;
        }
      }

      if ( typeof layersData !== "undefined"  ) {
        layersData.forEach(createLayer);
      }

      ensureBaseLayerExistence();
      baseLayers[Object.keys(baseLayers)[0]].addTo(map);

      if ( Object.keys(overlayLayers).length > 0 ) {
        for (let i = 0; i < Object.keys(overlayLayers).length; i++ ) {
          if ( overlayLayers[Object.keys(overlayLayers)[i]].options.show_by_default == true ) {
            overlayLayers[Object.keys(overlayLayers)[i]].addTo(map)
          }
        }
      }


      if ( Object.keys(baseLayers).length > 1 && Object.keys(overlayLayers).length > 0 ) {
        L.control.layers(baseLayers, overlayLayers).addTo(map);
      } else if ( Object.keys(overlayLayers).length > 0 ) {
        L.control.layers({}, overlayLayers).addTo(map);
      }


///


      var search = new GeoSearch.GeoSearchControl({
        provider: new GeoSearch.OpenStreetMapProvider(),
        style: 'bar',
        showMarker: false,
        searchLabel: 'Nach Adresse suchen',
        notFoundMessage: 'Entschuldigung! Die Adresse wurde nicht gefunden.',
      });

      map.addControl(search);

      L.control.locate({icon: 'fa fa-map-marker'}).addTo(map);


      if (markerLatitude && markerLongitude && !addMarker) {
        marker = createMarker(markerLatitude, markerLongitude, markerColor, markerIconClass);
      }

      if (editable) {
        $('.js-select-projekt').on("click", removeMarker);
        $(removeMarkerSelector).on("click", removeMarker);
        map.on("zoomend", function() {
          if (marker) {
            updateFormfields();
          }
        });
      }

      if (addMarker) {
        addMarker.forEach(function(coordinates) {
          if (App.Map.validCoordinates(coordinates)) {
            marker = createMarker(coordinates.lat, coordinates.long, coordinates.color, coordinates.fa_icon_class);

            if (process == "proposals") {
              marker.options.id = coordinates.proposal_id
            } else if (process == "deficiency-reports") {
              marker.options.id = coordinates.deficiency_report_id
            } else if (process == "projekts") {
              marker.options.id = coordinates.projekt_id
              marker.options.proposal_id = coordinates.proposal_id
            } else {
              marker.options.id = coordinates.investment_id
            }

            marker.on("click", openMarkerPopup);
          }
        });
      }
    },

    toggleMap: function() {
      $(".map").toggle();
      $(".js-location-map-remove-marker").toggle();
    },

    cleanCoordinates: function(element) {
      var clean_markers, markers;
      markers = $(element).attr("data-marker-process-coordinates");
      if (markers != null) {
        clean_markers = markers.replace(/-?(\*+)/g, null);
        $(element).attr("data-marker-process-coordinates", clean_markers);
      }
    },

    validCoordinates: function(coordinates) {
      return App.Map.isNumeric(coordinates.lat) && App.Map.isNumeric(coordinates.long);
    },

    isNumeric: function(n) {
      return !isNaN(parseFloat(n)) && isFinite(n);
    }
  };
}).call(this);
