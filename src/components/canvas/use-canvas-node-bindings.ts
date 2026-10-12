import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import type { GenerationNodeData } from "./GenerationNode";
import type { ImageNodeData } from "./ImageNode";
import type { TextNodeData } from "./TextNode";

type ImageHandlerKey =
  | "onCopy"
  | "onDuplicate"
  | "onSave"
  | "onQuickShare"
  | "onExportWechat"
  | "onReconstructInMasterGo"
  | "onRemoveBackground"
  | "onUseReference"
  | "onEdit"
  | "onSlice"
  | "onSaveAsTemplate"
  | "onOpenSourceTemplate"
  | "onViewDetails"
  | "onSwitchVersion"
  | "onSeparateVersions"
  | "onDelete";

type CommentHandlerKey = "onOpenComments" | "onMoveComment" | "onDeleteComment";
type LayoutHandlerKey = "onResizeStart" | "onResizeEnd";
type ConnectionHandler = NonNullable<ImageNodeData["onConnectionHandlePointerDown"]>;

export type CanvasImageNodeCapability = Pick<ImageNodeData, ImageHandlerKey>;
export type CanvasCommentNodeCapability = Pick<ImageNodeData, CommentHandlerKey>;
export type CanvasLayoutNodeCapability = Pick<ImageNodeData, LayoutHandlerKey>;

export interface CanvasWorkflowNodeCapability {
  onBeforeChange?: NonNullable<TextNodeData["onBeforeChange"]>;
  onTextChange?: NonNullable<TextNodeData["onChange"]>;
  onTextHeightChange?: NonNullable<TextNodeData["onHeightChange"]>;
  onGenerationChange?: NonNullable<GenerationNodeData["onChange"]>;
  onRunGeneration?: NonNullable<GenerationNodeData["onRun"]>;
  onGenerationHeightChange?: NonNullable<GenerationNodeData["onHeightChange"]>;
}

export interface CanvasConnectionNodeCapability {
  onConnectionHandlePointerDown?: ConnectionHandler;
}

export interface CanvasNodeBindingCapabilities {
  image: CanvasImageNodeCapability;
  workflow: CanvasWorkflowNodeCapability;
  comment: CanvasCommentNodeCapability;
  connection: CanvasConnectionNodeCapability;
  layout: CanvasLayoutNodeCapability;
}

export interface CanvasNodeBindingHandlerFacade {
  image: CanvasImageNodeCapability;
  workflow: {
    text: Pick<TextNodeData, "onBeforeChange" | "onChange" | "onHeightChange">;
    generation: Pick<GenerationNodeData, "onBeforeChange" | "onChange" | "onRun" | "onHeightChange">;
  };
  comment: CanvasCommentNodeCapability;
  connection: CanvasConnectionNodeCapability;
  layout: CanvasLayoutNodeCapability;
}

export function useCanvasNodeBindings(
  capabilities: CanvasNodeBindingCapabilities
): CanvasNodeBindingHandlerFacade {
  const mountedRef = useRef(true);
  const imageCapabilities = capabilities.image;
  const workflowCapabilities = capabilities.workflow;
  const commentCapabilities = capabilities.comment;
  const connectionCapabilities = capabilities.connection;
  const layoutCapabilities = capabilities.layout;
  const hasDuplicate = Boolean(imageCapabilities.onDuplicate);
  const hasQuickShare = Boolean(imageCapabilities.onQuickShare);
  const hasExportWechat = Boolean(imageCapabilities.onExportWechat);
  const hasReconstructInMasterGo = Boolean(imageCapabilities.onReconstructInMasterGo);
  const hasRemoveBackground = Boolean(imageCapabilities.onRemoveBackground);
  const hasEdit = Boolean(imageCapabilities.onEdit);
  const hasSlice = Boolean(imageCapabilities.onSlice);
  const hasSaveAsTemplate = Boolean(imageCapabilities.onSaveAsTemplate);
  const hasOpenSourceTemplate = Boolean(imageCapabilities.onOpenSourceTemplate);
  const hasViewDetails = Boolean(imageCapabilities.onViewDetails);
  const hasSwitchVersion = Boolean(imageCapabilities.onSwitchVersion);
  const hasSeparateVersions = Boolean(imageCapabilities.onSeparateVersions);
  const hasDelete = Boolean(imageCapabilities.onDelete);
  const hasOpenComments = Boolean(commentCapabilities.onOpenComments);
  const hasMoveComment = Boolean(commentCapabilities.onMoveComment);
  const hasDeleteComment = Boolean(commentCapabilities.onDeleteComment);
  const hasBeforeChange = Boolean(workflowCapabilities.onBeforeChange);
  const hasTextChange = Boolean(workflowCapabilities.onTextChange);
  const hasTextHeightChange = Boolean(workflowCapabilities.onTextHeightChange);
  const hasGenerationChange = Boolean(workflowCapabilities.onGenerationChange);
  const hasRunGeneration = Boolean(workflowCapabilities.onRunGeneration);
  const hasGenerationHeightChange = Boolean(workflowCapabilities.onGenerationHeightChange);
  const hasConnectionHandler = Boolean(connectionCapabilities.onConnectionHandlePointerDown);
  const hasResizeStart = Boolean(layoutCapabilities.onResizeStart);
  const hasResizeEnd = Boolean(layoutCapabilities.onResizeEnd);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const onCopy = useStableCapabilityCallback(mountedRef, imageCapabilities.onCopy);
  const onDuplicate = useStableCapabilityCallback(mountedRef, imageCapabilities.onDuplicate);
  const onSave = useStableCapabilityCallback(mountedRef, imageCapabilities.onSave);
  const onQuickShare = useStableCapabilityCallback(mountedRef, imageCapabilities.onQuickShare);
  const onExportWechat = useStableCapabilityCallback(mountedRef, imageCapabilities.onExportWechat);
  const onReconstructInMasterGo = useStableCapabilityCallback(
    mountedRef,
    imageCapabilities.onReconstructInMasterGo
  );
  const onRemoveBackground = useStableCapabilityCallback(mountedRef, imageCapabilities.onRemoveBackground);
  const onUseReference = useStableCapabilityCallback(mountedRef, imageCapabilities.onUseReference);
  const onEdit = useStableCapabilityCallback(mountedRef, imageCapabilities.onEdit);
  const onSlice = useStableCapabilityCallback(mountedRef, imageCapabilities.onSlice);
  const onSaveAsTemplate = useStableCapabilityCallback(mountedRef, imageCapabilities.onSaveAsTemplate);
  const onOpenSourceTemplate = useStableCapabilityCallback(mountedRef, imageCapabilities.onOpenSourceTemplate);
  const onViewDetails = useStableCapabilityCallback(mountedRef, imageCapabilities.onViewDetails);
  const onSwitchVersion = useStableCapabilityCallback(mountedRef, imageCapabilities.onSwitchVersion);
  const onSeparateVersions = useStableCapabilityCallback(mountedRef, imageCapabilities.onSeparateVersions);
  const onDelete = useStableCapabilityCallback(mountedRef, imageCapabilities.onDelete);

  const onOpenComments = useStableCapabilityCallback(mountedRef, commentCapabilities.onOpenComments);
  const onMoveComment = useStableCapabilityCallback(mountedRef, commentCapabilities.onMoveComment);
  const onDeleteComment = useStableCapabilityCallback(mountedRef, commentCapabilities.onDeleteComment);

  const onBeforeChange = useStableCapabilityCallback(mountedRef, workflowCapabilities.onBeforeChange);
  const onTextChange = useStableCapabilityCallback(mountedRef, workflowCapabilities.onTextChange);
  const onTextHeightChange = useStableCapabilityCallback(mountedRef, workflowCapabilities.onTextHeightChange);
  const onGenerationChange = useStableCapabilityCallback(mountedRef, workflowCapabilities.onGenerationChange);
  const onRunGeneration = useStableCapabilityCallback(mountedRef, workflowCapabilities.onRunGeneration);
  const onGenerationHeightChange = useStableCapabilityCallback(
    mountedRef,
    workflowCapabilities.onGenerationHeightChange
  );

  const onConnectionHandlePointerDown = useStableCapabilityCallback(
    mountedRef,
    connectionCapabilities.onConnectionHandlePointerDown
  );
  const onResizeStart = useStableCapabilityCallback(mountedRef, layoutCapabilities.onResizeStart);
  const onResizeEnd = useStableCapabilityCallback(mountedRef, layoutCapabilities.onResizeEnd);

  const image = useMemo<CanvasImageNodeCapability>(() => ({
    onCopy,
    onDuplicate: hasDuplicate ? onDuplicate : undefined,
    onSave,
    onQuickShare: hasQuickShare ? onQuickShare : undefined,
    onExportWechat: hasExportWechat ? onExportWechat : undefined,
    onReconstructInMasterGo: hasReconstructInMasterGo ? onReconstructInMasterGo : undefined,
    onRemoveBackground: hasRemoveBackground ? onRemoveBackground : undefined,
    onUseReference,
    onEdit: hasEdit ? onEdit : undefined,
    onSlice: hasSlice ? onSlice : undefined,
    onSaveAsTemplate: hasSaveAsTemplate ? onSaveAsTemplate : undefined,
    onOpenSourceTemplate: hasOpenSourceTemplate ? onOpenSourceTemplate : undefined,
    onViewDetails: hasViewDetails ? onViewDetails : undefined,
    onSwitchVersion: hasSwitchVersion ? onSwitchVersion : undefined,
    onSeparateVersions: hasSeparateVersions ? onSeparateVersions : undefined,
    onDelete: hasDelete ? onDelete : undefined
  }), [
    hasDelete,
    hasDuplicate,
    hasEdit,
    hasExportWechat,
    hasOpenSourceTemplate,
    hasQuickShare,
    hasReconstructInMasterGo,
    hasRemoveBackground,
    hasSaveAsTemplate,
    hasSeparateVersions,
    hasSlice,
    hasSwitchVersion,
    hasViewDetails,
    onCopy,
    onDelete,
    onDuplicate,
    onEdit,
    onExportWechat,
    onOpenSourceTemplate,
    onQuickShare,
    onReconstructInMasterGo,
    onRemoveBackground,
    onSave,
    onSaveAsTemplate,
    onSeparateVersions,
    onSlice,
    onSwitchVersion,
    onUseReference,
    onViewDetails
  ]);

  const comment = useMemo<CanvasCommentNodeCapability>(() => ({
    onOpenComments: hasOpenComments ? onOpenComments : undefined,
    onMoveComment: hasMoveComment ? onMoveComment : undefined,
    onDeleteComment: hasDeleteComment ? onDeleteComment : undefined
  }), [
    hasDeleteComment,
    hasMoveComment,
    hasOpenComments,
    onDeleteComment,
    onMoveComment,
    onOpenComments
  ]);

  const workflow = useMemo<CanvasNodeBindingHandlerFacade["workflow"]>(() => ({
    text: {
      onBeforeChange: hasBeforeChange ? onBeforeChange : undefined,
      onChange: hasTextChange ? onTextChange : undefined,
      onHeightChange: hasTextHeightChange ? onTextHeightChange : undefined
    },
    generation: {
      onBeforeChange: hasBeforeChange ? onBeforeChange : undefined,
      onChange: hasGenerationChange ? onGenerationChange : undefined,
      onRun: hasRunGeneration ? onRunGeneration : undefined,
      onHeightChange: hasGenerationHeightChange ? onGenerationHeightChange : undefined
    }
  }), [
    hasBeforeChange,
    hasGenerationChange,
    hasGenerationHeightChange,
    hasRunGeneration,
    hasTextChange,
    hasTextHeightChange,
    onBeforeChange,
    onGenerationChange,
    onGenerationHeightChange,
    onRunGeneration,
    onTextChange,
    onTextHeightChange
  ]);

  const connection = useMemo<CanvasConnectionNodeCapability>(() => ({
    onConnectionHandlePointerDown: hasConnectionHandler ? onConnectionHandlePointerDown : undefined
  }), [hasConnectionHandler, onConnectionHandlePointerDown]);

  const layout = useMemo<CanvasLayoutNodeCapability>(() => ({
    onResizeStart: hasResizeStart ? onResizeStart : undefined,
    onResizeEnd: hasResizeEnd ? onResizeEnd : undefined
  }), [
    hasResizeEnd,
    hasResizeStart,
    onResizeEnd,
    onResizeStart
  ]);

  return useMemo(() => ({ image, workflow, comment, connection, layout }), [
    comment,
    connection,
    image,
    layout,
    workflow
  ]);
}

function useStableCapabilityCallback<Args extends unknown[], Result>(
  mountedRef: RefObject<boolean>,
  callback: ((...args: Args) => Result) | undefined
): (...args: Args) => Result | undefined {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useCallback((...args: Args): Result | undefined => {
    if (!mountedRef.current) return undefined;
    return callbackRef.current?.(...args);
  }, [mountedRef]);
}
