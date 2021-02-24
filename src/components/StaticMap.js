import React, { Component, Fragment } from "react";
import DeckGL, { GeoJsonLayer } from "deck.gl";
import { connect } from "react-redux";
import { StaticMap } from "react-map-gl";
import { LightingEffect } from "@deck.gl/core";
import { MapboxLayer } from "@deck.gl/mapbox";
import { newTextLayer } from "components/MapboxLayers/textLayer";
//全局配置对象
import { config } from "./config";
//系统事件类型
import * as AppEvent from "./core/AppEvent";
//事件管理器
import EventManager from "./core/Managers/EventManager";

//环境创建对象
import { createSceneAmbientLight, createScenePointLight } from "./utils/EnvironmentCreator";
import { addDataActionCreate } from "store/addData/store/index.js";
import DeckGLLayerCreatorFactory from "./DeckGLLayerCreatorFactory.js";
import DeckGLLayerUpdateFactory from "./DeckGLLayerUpdateFactory.js";

// 导入服务图层添加事件
import {
    AddWebServiceLayer,
    UpdateWebServiceLayer,
} from "components/MapService/ServerLayerControl/CreateServiceLayer";


let map;
let deck;
let otherRenderLayers = [];
let moduleMap = new Map();
let layerMap = new Map();
let OptionMap = new Map();
let deckglLayer;
// 远程服务图层，Map和渲染图层
let serviceLayer;
let webServiceLayerMap = new Map();
let webServiceRenderLayers = [];
//MapBox访问令牌
const MAPBOX_TOKEN = config.viewpoint.accessToken;
//地图初始化范围
const INITIAL_VIEW_STATE = {
    longitude: config.viewpoint.center[0],
    latitude: config.viewpoint.center[1],
    zoom: config.viewpoint.zoom,
    bearing: config.viewpoint.bearing,
    pitch: config.viewpoint.pitch,
    maxBounds: config.viewpoint.bounds,
};

/**
 * 地图视图组件
 * 承载底图、基础可视化图层
 */

class ApplicationViewer extends Component {
    constructor() {
        super();
        this.state = {
            INITIAL_VIEW_STATE,
        };

        //添加deckgl图层
        EventManager.addEventListener(AppEvent.ADD_DECK_LAYER, this.addDeckLayer.bind(this));
        //删除deckgl图层
        EventManager.addEventListener(AppEvent.DELETE_DECKGL_LAYER, this.deleteDeckLayer.bind(this));
        //删除指定的文件
        EventManager.addEventListener(AppEvent.DELETE_FILE, this.deleteSpecifiedFile.bind(this));
        //切换地图样式
        EventManager.addEventListener(AppEvent.SWITCH_MAP_STYLE, this.switchMapStyle.bind(this));
        //清空所有数据
        EventManager.addEventListener(AppEvent.EMPTY_ALL_DATA_INFO, this.emptyAllLayer.bind(this))
        /**
         * 添加删除在线地图和远程服务图层
         * @addServiceLayer 添加图层的方法
         * @addWebServiceLayer 添加对应图层
         * @deleteServiceLayer 删除图层
         */
        EventManager.addEventListener(AppEvent.ADD_SERVICE_LAYER, this.addServiceLayer);
        EventManager.addEventListener(AppEvent.DELETE_SERVICE_LAYER, this.deleteServiceLayer);
    }

    /**
     * @description: 在组件销毁前撤销异步请求
     */
    componentWillUnmount() {
        this.setState = () => {
            return;
        }
    }
    /**
     * 退出系统，清空图层
     */
    emptyAllLayer = () => {
        layerMap.clear();
        moduleMap.clear();
        OptionMap.clear();
        webServiceLayerMap.clear();
        webServiceRenderLayers = [];
        otherRenderLayers = [];
        EventManager.removeAllListeners(AppEvent.ADD_DECK_LAYER)
        EventManager.removeAllListeners(AppEvent.ADD_SERVICE_LAYER)
        EventManager.removeAllListeners(AppEvent.LAOCL_FILE_LIST_SHOWED)
        EventManager.removeAllListeners(AppEvent.DELETE_FILE)
        EventManager.removeAllListeners("addLayerTree")
    }
    /**
     * 切换地图样式
     * @param {*} param 
     */
    switchMapStyle = (param) => {
        map.setStyle(param.style)
        map.once('styledata', function () {
            map.addLayer(new MapboxLayer({ id: "national_boundary_line", deck }));
            for (let item of webServiceLayerMap.keys()) {
                map.addLayer(new MapboxLayer({ id: item, deck }));
            }
            for (let item of layerMap.keys()) {
                if (layerMap.get(item)) {
                    map.addLayer(new MapboxLayer({ id: item, deck }));
                } else {
                    newTextLayer(OptionMap.get(item), map);
                }
            }
        });

    }

    _onViewStateChange({ INITIAL_VIEW_STATE }) {
        this.setState({ INITIAL_VIEW_STATE });
    }

    addServiceLayer = (info) => {
        if (webServiceLayerMap.has(info.layerId)) {
            webServiceLayerMap.set(
                info.layerId,
                UpdateWebServiceLayer.updateWebServiceLayer.bind(this)(info, webServiceLayerMap.get(info.layerId), map)
            );
            webServiceRenderLayers = [...webServiceLayerMap.values()];
        } else {
            serviceLayer = AddWebServiceLayer.addWebServiceLayer.bind(this)(info, map);
            webServiceLayerMap.set(info.layerId, serviceLayer);
            webServiceRenderLayers = [...webServiceLayerMap.values()];
            // 添加到预加载图层之下
            if (serviceLayer) {
                if (config.layerData[0].id) {
                    map.addLayer(new MapboxLayer({ id: info.layerId, deck }), config.layerData[0].id);
                } else {
                    map.addLayer(new MapboxLayer({ id: info.layerId, deck }));
                }
            }
        }
        this.setState({});
    };

    deleteServiceLayer = (info) => {
        webServiceLayerMap.delete(info.layerId);
        map.removeLayer(info.layerId);
        webServiceRenderLayers = [...webServiceLayerMap.values()];
        this.setState({});
    };

    /**
     * 添加 DeckGL 图层
     * @param {*} info 
     */
    addDeckLayer = (info) => {
        let layerId;
        if (moduleMap.has(info.addId)) {
            if (layerMap.has(info.layerId)) {
                deckglLayer = DeckGLLayerUpdateFactory.updateDeckLayer.bind(this)(info, layerMap.get(info.layerId), map)
                layerMap.set(
                    info.layerId,
                    deckglLayer
                );
                OptionMap.set(info.layerId, info);
                otherRenderLayers = [...layerMap.values()];
            } else {
                layerId = moduleMap.get(info.addId);
                layerMap.delete(layerId);
                OptionMap.delete(layerId)
                moduleMap.set(info.addId, info.layerId);
                deckglLayer = DeckGLLayerCreatorFactory.createDeckLayer.bind(this)(info, map);
                layerMap.set(info.layerId, deckglLayer);
                OptionMap.set(info.layerId, info);
                otherRenderLayers = [...layerMap.values()];
                if (deckglLayer) {
                    map.removeLayer(layerId);
                    map.addLayer(new MapboxLayer({ id: info.layerId, deck }));
                }
            }
        } else {
            moduleMap.set(info.addId, info.layerId);
            deckglLayer = DeckGLLayerCreatorFactory.createDeckLayer.bind(this)(info, map);
            layerMap.set(info.layerId, deckglLayer);
            OptionMap.set(info.layerId, info);
            if (deckglLayer) {
                map.addLayer(new MapboxLayer({ id: info.layerId, deck }));
            }
            otherRenderLayers = [...layerMap.values()];
        }
        this.setState({});
    };

    /**
     * 删除 DeckGL 图层
     * @param {*} index 
     */
    deleteDeckLayer = (index) => {
        this.props.removeUsedData(index)
        if (moduleMap.size > 0) {
            let layerId = moduleMap.get(index);
            if (layerId) {
                moduleMap.delete(index);
                layerMap.delete(layerId);
                OptionMap.delete(layerId);
                map.removeLayer(layerId);
                otherRenderLayers = [...layerMap.values()];
            }
        }
        this.setState({});
    };

    /**
     * 删除指定文件
     */
    deleteSpecifiedFile = (index) => {
        const { fileList, usedDataMap } = this.props;
        let specifiedLayerList = []
        for (let [key, value] of usedDataMap.entries()) {
            if (value === fileList[index].value) {
                this.deleteDeckLayer(key)
                specifiedLayerList.push(key)
            }
        }
        EventManager.dispatchEvent(AppEvent.DELETE_LAYERS_CORRESPONDINGTO_FLIE, specifiedLayerList)
    };

    /**
     * 初始化Deck.glMapBox.gl上下文
     */
    _onWebGLInitialized = (gl) => {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        this.setState({ gl });
    };

    /**
     * 地图加载完成回调
     */
    _onMapLoad = () => {
        map = this._map;
        deck = this._deck;
        map.addLayer(new MapboxLayer({ id: config.layerData[0].id, deck }));
        map.addLayer({
            'id': 'wms-test-layer',
            'type': 'raster',
            'source': {
                'type': 'raster',
                'tiles': ['http://192.168.6.26:8181/gis/vector/getMap?' +
                    'bbox={bbox-epsg-3857}' +
                    '&format=image/png' +
                    '&service=WMS' +
                    '&version=1.3.0' +
                    '&request=GetMap' +
                    '&crs=EPSG:3857' +
                    '&transparent=true' +
                    '&width=256&height=256' +
                    '&layers=2c9124b17603dd6f017603e6ccb30003'
                ],
                'tileSize': 256,
            },
            'paint': {}
        });
    };

    _renderLayers = () => {
        let renderLayers = [];
        // 默认加载国界线
        let geoJsonLayer = new GeoJsonLayer({
            id: config.layerData[0].id,
            data: config.layerData[0].data,
            stroked: config.layerData[0].stroked,
            filled: config.layerData[0].filled,
            extruded: config.layerData[0].extruded,
            lineWidthScale: config.layerData[0].lineWidthScale,
            lineWidthMinPixels: config.layerData[0].lineWidthMinPixels,
            getLineColor: config.layerData[0].getLineColor,
            getLineWidth: config.layerData[0].getLineWidth,
        });
        renderLayers.push(geoJsonLayer);
        otherRenderLayers.forEach((item) => {
            renderLayers.push(item);
        });
        webServiceRenderLayers.forEach((item) => {
            renderLayers.push(item);
        });
        console.log(renderLayers)
        return renderLayers;
    };
    render() {

        const { gl, INITIAL_VIEW_STATE } = this.state;
        const { ambientColor, ambientIntensity, pointLightList } = this.props
        //场景环境光
        let ambientLightOptions = {
            color: ambientColor.size ? Object.values(ambientColor.toJS()).slice(0, 3) : Object.values(ambientColor).slice(0, 3),
            intensity: ambientIntensity,
        };
        const ambientLight = createSceneAmbientLight(ambientLightOptions);

        //场景点光源
        let pointLightOptions = pointLightList.toJS();
        let scenePointLights = [];
        pointLightOptions.forEach((option) => {
            scenePointLights.push(createScenePointLight(option));
        });
        //光源效果对象
        const lightingEffect = new LightingEffect({ ambientLight, ...scenePointLights });
        return (
            <Fragment>
                <DeckGL
                    ref={(ref) => {
                        this._deck = ref && ref.deck;
                    }}
                    layers={this._renderLayers()}
                    effects={[lightingEffect]}
                    initialViewState={INITIAL_VIEW_STATE}
                    controller={true}
                    onWebGLInitialized={this._onWebGLInitialized}
                    onViewStateChange={this._onViewStateChange.bind(this)}
                >
                    {gl && (
                        <StaticMap
                            ref={(ref) => {
                                this._map = ref && ref.getMap();
                            }}
                            gl={gl}
                            mapStyle={config.viewpoint.default_style}
                            mapboxApiAccessToken={MAPBOX_TOKEN}
                            onLoad={this._onMapLoad}
                            transformRequest={(url, resourceType) => {
                                if (url.startsWith('http://192.168.6.26:8181')) {
                                    return {
                                        url: url,
                                        headers: { 'Authorization': 'Bearer da2d808e-0e69-4235-b8d0-5ea9c24082d6' },
                                    }
                                }
                            }}
                        ></StaticMap>
                    )}
                </DeckGL>
            </Fragment >
        );
    }
}

const mapStateToProps = (state) => {
    return {
        //环境光
        ambientIntensity: state.getIn(["lights", "ambientIntensity"]),
        ambientColor: state.getIn(['lights', 'ambientColor']),
        //点光源
        pointLightList: state.getIn(["lights", "pointLightList"]),
        //使用的数据Map
        usedDataMap: state.getIn(["addData", "usedDataMap"]),
        fileList: state.getIn(["addData", "fileList"]),
    };
};
const mapDispatchToProps = (dispatch) => {
    return {
        removeUsedData(value) {
            dispatch(addDataActionCreate.removeUsedData(value))
        }
    }
}
export default connect(mapStateToProps, mapDispatchToProps)(ApplicationViewer);
