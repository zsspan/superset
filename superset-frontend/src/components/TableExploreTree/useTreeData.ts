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
import { useMemo, useReducer, useCallback, useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { t } from '@apache-superset/core/translation';
import {
  Table,
  type TableMetaData,
  useSchemas,
  useLazyTablesQuery,
  useTablesQuery,
  useLazyTableMetadataQuery,
  useLazyTableExtendedMetadataQuery,
} from 'src/hooks/apiResources';
import { addDangerToast } from 'src/components/MessageToasts/actions';
import type { TableTreeNodeData } from './types';
import { ClientErrorObject, SupersetError } from '@superset-ui/core';

export const EMPTY_NODE_ID_PREFIX = 'empty:';

interface ErroredNode {
  schemaKey: string;
  dbId: number;
  catalog: string | null | undefined;
  schema: string;
}

interface TreeDataState {
  tableData: Record<string, { options: Table[] }>;
  tableSchemaData: Record<string, TableMetaData>;
  loadingNodes: Record<string, boolean>;
  errorPayload: SupersetError | null;
  erroredNode: ErroredNode | null;
}

type TreeDataAction =
  | { type: 'SET_TABLE_DATA'; key: string; data: { options: Table[] } }
  | { type: 'SET_TABLE_SCHEMA_DATA'; key: string; data: TableMetaData }
  | { type: 'CLEAR_TABLE_SCHEMA_DATA'; key: string }
  | { type: 'SET_LOADING_NODE'; nodeId: string; loading: boolean }
  | {
      type: 'SET_ERROR';
      errorPayload: SupersetError | null;
      erroredNode: ErroredNode | null;
    }
  | { type: 'RESET_STATE' };

const initialState: TreeDataState = {
  tableData: {},
  tableSchemaData: {},
  loadingNodes: {},
  errorPayload: null,
  erroredNode: null,
};

function treeDataReducer(
  state: TreeDataState,
  action: TreeDataAction,
): TreeDataState {
  switch (action.type) {
    case 'SET_TABLE_DATA':
      return {
        ...state,
        errorPayload: null,
        erroredNode: null,
        tableData: { ...state.tableData, [action.key]: action.data },
      };
    case 'SET_TABLE_SCHEMA_DATA':
      return {
        ...state,
        tableSchemaData: {
          ...state.tableSchemaData,
          [action.key]: action.data,
        },
      };
    case 'CLEAR_TABLE_SCHEMA_DATA': {
      const { [action.key]: _, ...rest } = state.tableSchemaData;
      return { ...state, tableSchemaData: rest };
    }
    case 'SET_LOADING_NODE':
      return {
        ...state,
        loadingNodes: {
          ...state.loadingNodes,
          [action.nodeId]: action.loading,
        },
      };
    case 'SET_ERROR':
      return {
        ...state,
        errorPayload: action.errorPayload,
        erroredNode: action.erroredNode,
      };
    case 'RESET_STATE':
      return initialState;

    default:
      return state;
  }
}

export interface UseTreeDataParams {
  dbId: number | undefined;
  catalog: string | null | undefined;
  pinnedTables?: Record<string, TableMetaData | undefined>;
  showColumns?: boolean;
}

export interface UseTreeDataResult {
  treeData: TableTreeNodeData[];
  isFetching: boolean;
  refetch: () => void;
  loadingNodes: Record<string, boolean>;
  selectStarMap: Record<string, string>;
  handleToggle: (id: string, isOpen: boolean) => Promise<void>;
  handleRefreshTables: (params: {
    dbId: number;
    catalog: string | null | undefined;
    schema: string;
  }) => void;
  refreshTableSchema: (id: string) => void;
  errorPayload: SupersetError | null;
}

const createEmptyNode = (parentId: string): TableTreeNodeData => ({
  id: `${EMPTY_NODE_ID_PREFIX}${parentId}`,
  name: t('No items'),
  type: 'empty',
});

const useTreeData = ({
  dbId,
  catalog,
  pinnedTables = {},
  showColumns = false,
}: UseTreeDataParams): UseTreeDataResult => {
  const reduxDispatch = useDispatch();

  const {
    currentData: schemaData,
    isFetching,
    refetch,
  } = useSchemas({ dbId, catalog: catalog || undefined });

  const [fetchLazyTables] = useLazyTablesQuery();
  const [fetchTableMetadata] = useLazyTableMetadataQuery();
  const [fetchTableExtendedMetadata] = useLazyTableExtendedMetadataQuery();

  const [state, dispatch] = useReducer(treeDataReducer, initialState);
  const {
    tableData,
    tableSchemaData,
    loadingNodes,
    errorPayload,
    erroredNode,
  } = state;

  // Reset internal state whenever dbId or catalog changes
  useEffect(() => {
    dispatch({ type: 'RESET_STATE' });
  }, [dbId, catalog]);

  const erroredTablesResult = useTablesQuery(
    {
      dbId: erroredNode?.dbId,
      catalog: erroredNode?.catalog,
      schema: erroredNode?.schema,
      forceRefresh: false,
    },
    { skip: !erroredNode },
  );
  const wasFetchingErroredRef = useRef(false);

  useEffect(() => {
    if (!erroredNode) {
      wasFetchingErroredRef.current = erroredTablesResult.isFetching;
      return;
    }
    const { isSuccess, isError, isFetching, currentData, error } =
      erroredTablesResult;
    const nodeId = `schema:${erroredNode.dbId}:${erroredNode.schema}`;
    if (isFetching && !wasFetchingErroredRef.current) {
      dispatch({ type: 'SET_LOADING_NODE', nodeId, loading: true });
    }
    if (!isFetching && wasFetchingErroredRef.current) {
      if (isSuccess && currentData) {
        dispatch({
          type: 'SET_TABLE_DATA',
          key: erroredNode.schemaKey,
          data: currentData,
        });
      } else if (isError) {
        dispatch({
          type: 'SET_ERROR',
          errorPayload: (error as ClientErrorObject)?.errors?.[0] ?? null,
          erroredNode,
        });
      }
      dispatch({ type: 'SET_LOADING_NODE', nodeId, loading: false });
    }
    wasFetchingErroredRef.current = isFetching;
  }, [erroredTablesResult, erroredNode]);

  const fetchAndStoreTableSchema = useCallback(
    (id: string, preferCacheValue: boolean) => {
      if (loadingNodes[id]) return;

      const parts = id.split(':');
      const [, databaseId, schema, table] = parts;
      const parsedDbId = Number(databaseId);
      const tableKey = `${parsedDbId}:${schema}:${table}`;

      dispatch({ type: 'SET_LOADING_NODE', nodeId: id, loading: true });

      Promise.all([
        fetchTableMetadata(
          { dbId: parsedDbId, catalog, schema, table },
          preferCacheValue,
        ).unwrap(),
        fetchTableExtendedMetadata(
          { dbId: parsedDbId, catalog, schema, table },
          preferCacheValue,
        ).unwrap(),
      ])
        .then(([tableMetadata, tableExtendedMetadata]) => {
          if (tableMetadata) {
            dispatch({
              type: 'SET_TABLE_SCHEMA_DATA',
              key: tableKey,
              data: { ...tableMetadata, ...tableExtendedMetadata },
            });
          }
        })
        .catch(() => {
          reduxDispatch(
            addDangerToast(
              t(
                'An error occurred while fetching table metadata for %s',
                table,
              ),
            ),
          );
        })
        .finally(() => {
          dispatch({ type: 'SET_LOADING_NODE', nodeId: id, loading: false });
        });
    },
    [
      catalog,
      fetchTableExtendedMetadata,
      fetchTableMetadata,
      loadingNodes,
      reduxDispatch,
    ],
  );

  const handleToggle = useCallback(
    async (id: string, isOpen: boolean) => {
      if (!isOpen) return;

      const parts = id.split(':');
      const [identifier, databaseId, schema, table] = parts;
      const parsedDbId = Number(databaseId);

      if (identifier === 'schema') {
        const schemaKey = `${parsedDbId}:${schema}`;
        if (!tableData?.[schemaKey]) {
          dispatch({ type: 'SET_LOADING_NODE', nodeId: id, loading: true });

          fetchLazyTables(
            { dbId: parsedDbId, catalog, schema, forceRefresh: false },
            true,
          )
            .unwrap()
            .then(data => {
              if (data) {
                dispatch({ type: 'SET_TABLE_DATA', key: schemaKey, data });
              }
            })
            .catch(error => {
              dispatch({
                type: 'SET_ERROR',
                errorPayload: error?.errors?.[0] ?? null,
                erroredNode: {
                  schemaKey,
                  dbId: parsedDbId,
                  catalog,
                  schema,
                },
              });
            })
            .finally(() => {
              dispatch({
                type: 'SET_LOADING_NODE',
                nodeId: id,
                loading: false,
              });
            });
        }
      }

      if (identifier === 'table' && showColumns) {
        const tableKey = `${parsedDbId}:${schema}:${table}`;

        if (pinnedTables[tableKey]) return;

        if (!tableSchemaData[tableKey]) {
          fetchAndStoreTableSchema(id, true);
        }
      }
    },
    [
      catalog,
      fetchAndStoreTableSchema,
      fetchLazyTables,
      pinnedTables,
      showColumns,
      tableData,
      tableSchemaData,
    ],
  );

  const handleRefreshTables = useCallback(
    ({
      dbId: refreshDbId,
      catalog: refreshCatalog,
      schema,
    }: {
      dbId: number;
      catalog: string | null | undefined;
      schema: string;
    }) => {
      const schemaKey = `${refreshDbId}:${schema}`;
      const nodeId = `schema:${refreshDbId}:${schema}`;

      dispatch({ type: 'SET_LOADING_NODE', nodeId, loading: true });

      fetchLazyTables({
        dbId: refreshDbId,
        catalog: refreshCatalog,
        schema,
        forceRefresh: true,
      })
        .unwrap()
        .then(data => {
          dispatch({ type: 'SET_TABLE_DATA', key: schemaKey, data });
        })
        .catch(error => {
          dispatch({
            type: 'SET_ERROR',
            errorPayload: error?.errors?.[0] ?? null,
            erroredNode: {
              schemaKey,
              dbId: refreshDbId,
              catalog: refreshCatalog,
              schema,
            },
          });
        })
        .finally(() => {
          dispatch({ type: 'SET_LOADING_NODE', nodeId, loading: false });
        });
    },
    [fetchLazyTables],
  );

  const refreshTableSchema = useCallback(
    (id: string) => {
      fetchAndStoreTableSchema(id, false);
    },
    [fetchAndStoreTableSchema],
  );

  const treeData = useMemo((): TableTreeNodeData[] => {
    const data = schemaData?.map(schema => {
      const schemaKey = `${dbId}:${schema.value}`;
      const schemaId = `schema:${dbId}:${schema.value}`;
      const tablesData = tableData?.[schemaKey];
      const tables = tablesData?.options;

      let schemaChildren: TableTreeNodeData[];
      if (!tablesData) {
        schemaChildren = [];
      } else if (tables && tables.length > 0) {
        schemaChildren = tables.map(({ value: tableName, type: tableType }) => {
          const tableKey = `${dbId}:${schema.value}:${tableName}`;
          const tableId = `table:${dbId}:${schema.value}:${tableName}`;
          const columnsData =
            tableSchemaData[tableKey] ?? pinnedTables[tableKey];
          const columns = columnsData?.columns;

          let tableChildren: TableTreeNodeData[] | undefined;
          if (showColumns) {
            if (!columnsData) {
              tableChildren = [];
            } else if (columns && columns.length > 0) {
              tableChildren = columns.map(col => ({
                id: `column:${dbId}:${schema.value}:${tableName}:${col.name}`,
                name: col.name,
                type: 'column' as const,
                columnData: col,
              }));
            } else {
              tableChildren = [createEmptyNode(tableId)];
            }
          }

          return {
            id: tableId,
            name: tableName,
            type: 'table' as const,
            tableType,
            children: tableChildren,
            disableCheckbox: !columnsData,
          };
        });
      } else {
        schemaChildren = [createEmptyNode(schemaId)];
      }

      return {
        id: schemaId,
        name: schema.label,
        type: 'schema' as const,
        children: schemaChildren,
        disableCheckbox: !tablesData,
      };
    });

    return data ?? [];
  }, [dbId, schemaData, tableData, tableSchemaData, pinnedTables, showColumns]);

  const selectStarMap = useMemo(() => {
    const map: Record<string, string> = {};
    const addEntry = (key: string, meta: TableMetaData | undefined) => {
      if (meta?.selectStar) {
        map[key] = meta.selectStar;
      }
    };
    Object.entries(tableSchemaData).forEach(([key, meta]) =>
      addEntry(key, meta),
    );
    Object.entries(pinnedTables).forEach(([key, meta]) => addEntry(key, meta));
    return map;
  }, [tableSchemaData, pinnedTables]);

  return {
    treeData,
    isFetching,
    refetch,
    loadingNodes,
    selectStarMap,
    handleToggle,
    handleRefreshTables,
    refreshTableSchema,
    errorPayload,
  };
};

export default useTreeData;
