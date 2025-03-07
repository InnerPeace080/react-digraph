// @flow
/*
  Copyright(c) 2018 Uber Technologies, Inc.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

          http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

import * as d3 from 'd3';
import * as React from 'react';
// This works in Typescript but causes an import loop for Flowtype. We'll just use `any` below.
// import { type LayoutEngine } from '../utilities/layout-engine/layout-engine-config';
import Edge from './edge';
import GraphUtils from './graph-util';
import NodeText from './node-text';

export type IPoint = {
  x: number,
  y: number,
};

export type INode = {
  title: string,
  x?: number | null,
  y?: number | null,
  type?: string,
  subtype?: string | null,
  backtypes?: string[],
  fronttypes?: string[],
  [key: string]: any,
};

type INodeProps = {
  data: INode,
  id: string,
  nodeTypes: any, // TODO: make a nodeTypes interface
  nodeSubtypes: any, // TODO: make a nodeSubtypes interface
  opacity?: number,
  nodeKey: string,
  nodeSize?: number,
  lock?: boolean,
  onNodeMouseEnter: (event: any, data: any, hovered: boolean) => void,
  onNodeMouseLeave: (event: any, data: any) => void,
  onNodeMove: (point: IPoint, id: string, shiftKey: boolean) => void,
  onNodeSelected: (
    data: any,
    id: string,
    shiftKey: boolean,
    event?: any
  ) => void,
  onNodeUpdate: (point: IPoint, id: string, shiftKey: boolean) => void,
  renderNode?: (
    nodeRef: any,
    data: any,
    id: string,
    selected: boolean,
    hovered: boolean
  ) => any,
  renderNodeText?: (data: any, id: string | number, isSelected: boolean) => any,
  isSelected: boolean,
  layoutEngine?: any,
  viewWrapperElem: HTMLDivElement,
  centerNodeOnMove: boolean,
  maxTitleChars: number,
};

type INodeState = {
  hovered: boolean,
  x: number,
  y: number,
  selected: boolean,
  mouseDown: boolean,
  drawingEdge: boolean,
  pointerOffset: ?{ x: number, y: number },
};

class Node extends React.Component<INodeProps, INodeState> {
  static defaultProps = {
    isSelected: false,
    nodeSize: 154,
    onNodeMouseEnter: () => {
      return;
    },
    onNodeMouseLeave: () => {
      return;
    },
    onNodeMove: () => {
      return;
    },
    onNodeSelected: () => {
      return;
    },
    onNodeUpdate: () => {
      return;
    },
    centerNodeOnMove: true,
  };

  static getDerivedStateFromProps(
    nextProps: INodeProps,
    prevState: INodeState
  ) {
    if (
      !nextProps.data.isAnimated ||
      prevState.drawingEdge ||
      prevState.mouseDown
    ) {
      return {
        selected: nextProps.isSelected,
        x: nextProps.data.x,
        y: nextProps.data.y,
      };
    } else {
      return {
        selected: nextProps.isSelected,
      };
    }
  }

  nodeRef: any;
  oldSibling: any;

  constructor(props: INodeProps) {
    super(props);

    this.state = {
      drawingEdge: false,
      hovered: false,
      mouseDown: false,
      selected: false,
      x: (props.data && props.data.x) || 0,
      y: (props.data && props.data.y) || 0,
      pointerOffset: null,
    };

    this.prevX = undefined;
    this.prevY = undefined;
    this.nodeRef = React.createRef();
  }

  componentDidMount() {
    const dragFunction = d3
      .drag()
      .on('drag', this.handleMouseMove)
      .on('start', this.handleDragStart)
      .on('end', this.handleDragEnd);

    d3.select(this.nodeRef.current)
      .on('mouseout', this.handleMouseOut)
      .call(dragFunction);
  }

  handleMouseMove = () => {
    const mouseButtonDown = d3.event.sourceEvent.buttons === 1;
    const shiftKey = d3.event.sourceEvent.shiftKey;
    const {
      nodeSize,
      layoutEngine,
      nodeKey,
      viewWrapperElem,
      lock,
    } = this.props;

    if (!mouseButtonDown || lock) {
      return;
    }

    // While the mouse is down, this function handles all mouse movement
    const newState = {
      x: d3.event.x,
      y: d3.event.y,
    };

    if (!this.props.centerNodeOnMove) {
      newState.pointerOffset = this.state.pointerOffset || {
        x: d3.event.x - this.props.data.x,
        y: d3.event.y - this.props.data.y,
      };
      newState.x -= newState.pointerOffset.x;
      newState.y -= newState.pointerOffset.y;
    }

    if (shiftKey) {
      this.setState({ drawingEdge: true });
      // draw edge
      // undo the target offset subtraction done by Edge
      const off = Edge.calculateOffset(
        nodeSize,
        this.props.data,
        newState,
        nodeKey,
        true,
        viewWrapperElem
      );

      newState.x += off.xOff;
      newState.y += off.yOff;
      // now tell the graph that we're actually drawing an edge
    } else if (!this.state.drawingEdge && layoutEngine) {
      // move node using the layout engine
      Object.assign(newState, layoutEngine.getPositionForNode(newState));
    }

    this.setState(newState);
    // Never use this.props.index because if the nodes array changes order
    // then this function could move the wrong node.
    this.props.onNodeMove(newState, this.props.data[nodeKey], shiftKey);
  };

  handleDragStart = () => {
    if (!this.nodeRef.current) {
      return;
    }

    if (!this.oldSibling) {
      this.oldSibling = this.nodeRef.current.parentElement.nextSibling;
    }

    // Moves child to the end of the element stack to re-arrange the z-index
    this.nodeRef.current.parentElement.parentElement.appendChild(
      this.nodeRef.current.parentElement
    );

    this.setState({
      mouseDown: true,
    });
  };

  handleDragEnd = () => {
    if (!this.nodeRef.current) {
      return;
    }

    const { x, y, drawingEdge } = this.state;
    const { data, nodeKey, onNodeSelected, onNodeUpdate } = this.props;
    const { sourceEvent } = d3.event;

    this.setState({
      mouseDown: false,
      drawingEdge: false,
      pointerOffset: null,
    });

    if (this.oldSibling && this.oldSibling.parentElement) {
      this.oldSibling.parentElement.insertBefore(
        this.nodeRef.current.parentElement,
        this.oldSibling
      );
    }

    const shiftKey = sourceEvent.shiftKey;

    onNodeUpdate({ x, y }, data[nodeKey], shiftKey || drawingEdge);

    onNodeSelected(data, data[nodeKey], shiftKey || drawingEdge, sourceEvent);
  };

  handleMouseOver = (event: any) => {
    // Detect if mouse is already down and do nothing.
    let hovered = false;

    if (
      (d3.event && d3.event.buttons !== 1) ||
      (event && event.buttons !== 1)
    ) {
      hovered = true;
      this.setState({ hovered });
    }

    this.props.onNodeMouseEnter(event, this.props.data, hovered);
  };

  handleMouseOut = (event: any) => {
    // Detect if mouse is already down and do nothing. Sometimes the system lags on
    // drag and we don't want the mouseOut to fire while the user is moving the
    // node around

    this.setState({ hovered: false });
    this.props.onNodeMouseLeave(event, this.props.data);
  };

  static getNodeTypeXlinkHref(data: INode, nodeTypes: any) {
    if (data.type && nodeTypes[data.type]) {
      return nodeTypes[data.type].shapeId;
    } else if (nodeTypes.emptyNode) {
      return nodeTypes.emptyNode.shapeId;
    }

    return null;
  }

  static getNodeSubtypeXlinkHref(data: INode, nodeSubtypes?: any) {
    if (data.subtype && nodeSubtypes && nodeSubtypes[data.subtype]) {
      return nodeSubtypes[data.subtype].shapeId;
    } else if (nodeSubtypes && nodeSubtypes.emptyNode) {
      return nodeSubtypes.emptyNode.shapeId;
    }

    return null;
  }
  static getNodeBacktypeXlinkHref(data: INode, nodeSubtypes?: any) {
    if (data.backtypes && nodeSubtypes) {
      return data.backtypes.map(c => {
        if (c && nodeSubtypes[c]) {
          return nodeSubtypes[c].shapeId;
        } else if (nodeSubtypes.emptyNode) {
          return nodeSubtypes.emptyNode.shapeId;
        }
      });
    }

    return null;
  }
  static getNodeFronttypeXlinkHref(data: INode, nodeSubtypes?: any) {
    if (data.fronttypes && nodeSubtypes) {
      return data.fronttypes.map(c => {
        if (c && nodeSubtypes[c]) {
          return nodeSubtypes[c].shapeId;
        } else if (nodeSubtypes.emptyNode) {
          return nodeSubtypes.emptyNode.shapeId;
        }
      });
    }

    return null;
  }

  renderShape() {
    const {
      renderNode,
      data,
      index,
      nodeTypes,
      nodeSubtypes,
      nodeKey,
    } = this.props;
    const { hovered, selected } = this.state;
    const props = {
      height: this.props.nodeSize || 0,
      width: this.props.nodeSize || 0,
    };
    const nodeShapeContainerClassName = GraphUtils.classNames('shape');
    const nodeClassName = GraphUtils.classNames('node', { selected, hovered });
    const nodeSubtypeClassName = GraphUtils.classNames('subtype-shape', {
      selected: this.state.selected,
    });
    const nodeTypeXlinkHref = Node.getNodeTypeXlinkHref(data, nodeTypes) || '';
    const nodeSubtypeXlinkHref =
      Node.getNodeSubtypeXlinkHref(data, nodeSubtypes) || '';
    const nodeBacktypeXlinkHref =
      Node.getNodeBacktypeXlinkHref(data, nodeSubtypes) || '';
    const nodeFronttypeXlinkHref =
      Node.getNodeFronttypeXlinkHref(data, nodeSubtypes) || '';

    // get width and height defined on def element
    const defSvgNodeElement: any = nodeTypeXlinkHref
      ? document.querySelector(`defs>${nodeTypeXlinkHref}`)
      : null;
    const nodeWidthAttr = defSvgNodeElement
      ? defSvgNodeElement.getAttribute('width')
      : 0;
    const nodeHeightAttr = defSvgNodeElement
      ? defSvgNodeElement.getAttribute('height')
      : 0;

    props.width = nodeWidthAttr ? parseInt(nodeWidthAttr, 10) : props.width;
    props.height = nodeHeightAttr ? parseInt(nodeHeightAttr, 10) : props.height;

    if (renderNode) {
      // Originally: graphView, domNode, datum, index, elements.
      return renderNode(this.nodeRef, data, data[nodeKey], selected, hovered);
    } else {
      return (
        <g className={nodeShapeContainerClassName} {...props}>
          {nodeBacktypeXlinkHref &&
            nodeBacktypeXlinkHref.map((c, i) => (
              <use
                key={i}
                data-index={index}
                className={nodeSubtypeClassName}
                x={-props.width / 2}
                y={-props.height / 2}
                width={props.width}
                height={props.height}
                xlinkHref={c}
              />
            ))}
          {!!data.subtype && (
            <use
              data-index={index}
              className={nodeSubtypeClassName}
              x={-props.width / 2}
              y={-props.height / 2}
              width={props.width}
              height={props.height}
              xlinkHref={nodeSubtypeXlinkHref}
            />
          )}
          <use
            data-index={index}
            className={nodeClassName}
            x={-props.width / 2}
            y={-props.height / 2}
            width={props.width}
            height={props.height}
            xlinkHref={nodeTypeXlinkHref}
          />
          {nodeFronttypeXlinkHref &&
            nodeFronttypeXlinkHref.map((c, i) => (
              <use
                key={i}
                data-index={index}
                className={nodeSubtypeClassName}
                x={-props.width / 2}
                y={-props.height / 2}
                width={props.width}
                height={props.height}
                xlinkHref={c}
              />
            ))}
        </g>
      );
    }
  }

  renderText() {
    const {
      data,
      id,
      nodeTypes,
      renderNodeText,
      isSelected,
      maxTitleChars,
    } = this.props;

    if (renderNodeText) {
      return renderNodeText(data, id, isSelected);
    }

    return (
      <NodeText
        data={data}
        nodeTypes={nodeTypes}
        isSelected={this.state.selected}
        maxTitleChars={maxTitleChars}
      />
    );
  }

  render() {
    const { x, y, hovered, selected } = this.state;
    const { opacity, id, data } = this.props;
    const className = GraphUtils.classNames('node', data.type, {
      hovered,
      selected,
    });

    return (
      <g
        className={className}
        onMouseOver={this.handleMouseOver}
        onMouseOut={this.handleMouseOut}
        id={id}
        ref={this.nodeRef}
        opacity={opacity}
        transform={`translate(${x}, ${y})`}
      >
        {this.renderShape()}
        {this.renderText()}
      </g>
    );
  }

  componentDidUpdate(prevProps, prevState) {
    if (
      this.props.data &&
      this.props.data.isAnimated &&
      !this.state.drawingEdge &&
      !this.state.mouseDown &&
      (this.props.data.x != this.prevX || this.props.data.y != this.prevY)
    ) {
      this.prevX = this.props.data.x;
      this.prevY = this.props.data.y;
      d3.select(this.nodeRef.current)
        .transition()
        .duration(1000)
        .attr(
          'transform',
          `translate(${this.props.data.x},
            ${this.props.data.y})`
        )
        .end()
        .then(() => {
          this.setState({
            x: this.props.data.x,
            y: this.props.data.y,
          });
        })
        .catch(err => {});
    } else if (this.props.data) {
      this.prevX = this.props.data.x;
      this.prevY = this.props.data.y;
      d3.select(this.nodeRef.current).transition();
    }
  }
}

export default Node;
