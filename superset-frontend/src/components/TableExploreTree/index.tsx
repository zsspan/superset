/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useState,
  useRef,
  type ChangeEvent,
  useMemo,
} from 'react';
import { styled, css, useTheme } from '@apache-superset/core/theme';
import { t } from '@apache-superset/core/translation';
import AutoSizer from 'react-virtualized-auto-sizer';
import { Tree, TreeApi, NodeApi } from 'react-arborist';
import {
  Icons,
  Skeleton,
  Input,
  Empty,
  Button,
} from '@superset-ui/core/components';
import PanelToolbar from 'src/components/PanelToolbar';
import { ErrorMessageWithStackTrace } from 'src/components';
import TreeNodeRenderer from './TreeNodeRenderer';
import useTreeData, { EMPTY_NODE_ID_PREFIX } from './useTreeData';
import type { TableTreeNodeData, TableExploreTreeProps } from './types';

const StyledTreeContainer = styled.div`
  flex: 1 1 auto;
  min-height: 200px;
  .tree-node {
    display: flex;
    align-items: center;
    padding: 0 ${({ theme }) => theme.sizeUnit}px;
    position: relative;
    cursor: pointer;

    &:hover {
      background-color: ${({ theme }) => theme.colorBgTextHover};

      .action-static {
        display: none;
      }

      .action-hover {
        display: flex;
      }
    }

    &[data-selected='true'] {
      background-color: ${({ theme }) => theme.colorBgTextActive};

      .action-static {
        display: none;
      }

      .action-hover {
        display: flex;
      }
    }
  }

  .tree-node-icon {
    margin-right: ${({ theme }) => theme.sizeUnit}px;
    display: flex;
    align-items: center;
    gap: ${({ theme }) => theme.sizeUnit}px;
  }

  .tree-node-title {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }

  .highlighted {
    background-color: ${({ theme }) => theme.colorWarningBg};
    font-weight: bold;
  }

  .side-action-container {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    margin-left: auto;
  }

  .action-static {
    display: flex;
    align-items: center;
  }

  .action-hover {
    display: none;
    align-items: center;
    gap: ${({ theme }) => theme.sizeUnit * 0.5}px;
  }
`;

const ROW_HEIGHT = 28;

const TableExploreTree: React.FC<TableExploreTreeProps> = ({
  dbId,
  catalog,
  selectedTable,
  onSelectTable,
  renderTableExtra,
  showColumns = false,
  showToolbar = true,
  toolbarViewId,
  allowPinning = false,
  pinnedSchemas = new Set(),
  onPinSchema,
  onUnpinSchema,
  pinnedTableKeys = new Set(),
  onPinTable,
  onUnpinTable,
  selectStarMap = {},
  pinnedTables = {},
}) => {
  const theme = useTheme();
  const treeRef = useRef<TreeApi<TableTreeNodeData>>(null);

  const {
    treeData,
    isFetching,
    refetch,
    loadingNodes,
    selectStarMap: internalSelectStarMap,
    handleToggle,
    handleRefreshTables,
    refreshTableSchema,
    errorPayload,
  } = useTreeData({
    dbId,
    catalog,
    pinnedTables,
    showColumns,
  });

  const mergedSelectStarMap = useMemo(
    () => ({
      ...internalSelectStarMap,
      ...selectStarMap,
    }),
    [internalSelectStarMap, selectStarMap],
  );

  const sortedTreeData = useMemo(() => {
    if (pinnedSchemas.size === 0) return treeData;
    const pinned = treeData.filter(node => pinnedSchemas.has(node.name));
    const rest = treeData.filter(node => !pinnedSchemas.has(node.name));
    return [...pinned, ...rest];
  }, [treeData, pinnedSchemas]);

  const [sortedTables, setSortedTables] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setSortedTables({});
  }, [dbId, catalog]);

  const toggleSortColumns = useCallback((tableId: string) => {
    setSortedTables(prev => ({ ...prev, [tableId]: !prev[tableId] }));
  }, []);

  const displayTreeData = useMemo(() => {
    if (!showColumns) return sortedTreeData;
    const activeSorted = Object.keys(sortedTables).filter(
      id => sortedTables[id],
    );
    if (activeSorted.length === 0) return sortedTreeData;

    const sortedSet = new Set(activeSorted);
    return sortedTreeData.map(schemaNode => ({
      ...schemaNode,
      children: schemaNode.children?.map(tableNode => {
        if (tableNode.type !== 'table' || !sortedSet.has(tableNode.id)) {
          return tableNode;
        }
        const { children } = tableNode;
        if (!children || children.length <= 1) return tableNode;
        return {
          ...tableNode,
          children: [...children].sort((a, b) => a.name.localeCompare(b.name)),
        };
      }),
    }));
  }, [sortedTreeData, sortedTables, showColumns]);

  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const handleSearchChange = useCallback(
    ({ target }: ChangeEvent<HTMLInputElement>) => setSearchTerm(target.value),
    [],
  );

  const [manuallyOpenedNodes, setManuallyOpenedNodes] = useState<
    Record<string, boolean>
  >({});

  const manuallyOpenedNodesRef = useRef(manuallyOpenedNodes);
  manuallyOpenedNodesRef.current = manuallyOpenedNodes;

  useEffect(() => {
    Object.entries(manuallyOpenedNodesRef.current)
      .filter(([, isOpen]) => isOpen)
      .forEach(([id]) => treeRef.current?.open(id));
  }, [treeData]);

  const searchMatch = useCallback(
    (node: NodeApi<TableTreeNodeData>, term: string): boolean => {
      if (node.data.type === 'empty') return false;
      if (!term) return true;

      const lowerTerm = term.toLowerCase();
      if (node.data.name.toLowerCase().includes(lowerTerm)) {
        return true;
      }

      let ancestor = node.parent;
      while (ancestor && !ancestor.isRoot) {
        if (ancestor.data.name.toLowerCase().includes(lowerTerm)) {
          return true;
        }
        ancestor = ancestor.parent;
      }
      return false;
    },
    [],
  );

  const hasMatchingNodes = useMemo(() => {
    if (!deferredSearchTerm) return true;

    const lowerTerm = deferredSearchTerm.toLowerCase();

    const checkNode = (node: TableTreeNodeData): boolean => {
      if (node.type === 'empty') return false;
      if (node.name.toLowerCase().includes(lowerTerm)) return true;
      if (node.children) {
        return node.children.some(child => checkNode(child));
      }
      return false;
    };

    return displayTreeData.some(node => checkNode(node));
  }, [deferredSearchTerm, displayTreeData]);

  const renderNode = useCallback(
    (props: Parameters<typeof TreeNodeRenderer>[0]) => (
      <TreeNodeRenderer
        {...props}
        manuallyOpenedNodes={manuallyOpenedNodes}
        loadingNodes={loadingNodes}
        searchTerm={deferredSearchTerm}
        catalog={catalog}
        showColumns={showColumns}
        allowPinning={allowPinning}
        pinnedTableKeys={pinnedTableKeys}
        pinnedSchemas={pinnedSchemas}
        selectStarMap={mergedSelectStarMap}
        handleRefreshTables={handleRefreshTables}
        handlePinTable={onPinTable}
        handleUnpinTable={onUnpinTable}
        handlePinSchema={onPinSchema}
        handleUnpinSchema={onUnpinSchema}
        refreshTableSchema={refreshTableSchema}
        sortedTables={sortedTables}
        toggleSortColumns={toggleSortColumns}
        selectedTable={selectedTable}
        onSelectTable={onSelectTable}
        renderTableExtra={renderTableExtra}
      />
    ),
    [
      manuallyOpenedNodes,
      loadingNodes,
      deferredSearchTerm,
      catalog,
      showColumns,
      allowPinning,
      pinnedTableKeys,
      pinnedSchemas,
      mergedSelectStarMap,
      handleRefreshTables,
      onPinTable,
      onUnpinTable,
      onPinSchema,
      onUnpinSchema,
      refreshTableSchema,
      sortedTables,
      toggleSortColumns,
      selectedTable,
      onSelectTable,
      renderTableExtra,
    ],
  );

  return (
    <>
      {showToolbar && (
        <div
          css={css`
            margin-left: -${theme.sizeUnit * 2}px;
            margin-bottom: ${theme.sizeUnit * 1.5}px;
          `}
        >
          <PanelToolbar
            viewId={toolbarViewId || 'table.explore.tree'}
            defaultPrimaryActions={
              <>
                <Button
                  color="primary"
                  variant="text"
                  icon={<Icons.MinusSquareOutlined />}
                  onClick={() => {
                    treeRef.current?.closeAll();
                    setManuallyOpenedNodes({});
                  }}
                  tooltip={t('Collapse all')}
                />
                <Button
                  color="primary"
                  variant="text"
                  icon={<Icons.ReloadOutlined />}
                  onClick={() => refetch()}
                  loading={isFetching}
                  tooltip={t('Force refresh schema list')}
                />
              </>
            }
          />
        </div>
      )}
      <Input
        allowClear
        type="text"
        className="form-control input-sm"
        placeholder={t('Enter a part of the object name')}
        onChange={handleSearchChange}
        value={searchTerm}
        css={css`
          margin-bottom: ${theme.sizeUnit * 3}px;
        `}
      />
      {errorPayload && (
        <ErrorMessageWithStackTrace error={errorPayload} source="crud" />
      )}
      <StyledTreeContainer>
        <AutoSizer disableWidth>
          {({ height }) => {
            if (isFetching) {
              return <Skeleton active />;
            }

            if (deferredSearchTerm && !hasMatchingNodes) {
              return (
                <Empty
                  description={t('No matching results found')}
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              );
            }

            return (
              <Tree<TableTreeNodeData>
                ref={treeRef}
                data={displayTreeData}
                width="100%"
                height={height || 500}
                rowHeight={ROW_HEIGHT}
                indent={16}
                searchTerm={deferredSearchTerm}
                searchMatch={searchMatch}
                disableDrag
                disableDrop
                openByDefault={false}
                initialOpenState={manuallyOpenedNodes}
                onToggle={id => {
                  if (id.startsWith(EMPTY_NODE_ID_PREFIX)) {
                    return;
                  }

                  const wasOpen = deferredSearchTerm
                    ? (treeRef.current?.get(id)?.isOpen ??
                      manuallyOpenedNodes[id] ??
                      false)
                    : (manuallyOpenedNodes[id] ?? false);
                  const isNowOpen = !wasOpen;

                  if (isNowOpen) {
                    handleToggle(id, true);
                  }

                  setManuallyOpenedNodes(prev => ({
                    ...prev,
                    [id]: isNowOpen,
                  }));
                }}
              >
                {renderNode}
              </Tree>
            );
          }}
        </AutoSizer>
      </StyledTreeContainer>
    </>
  );
};

export default TableExploreTree;
