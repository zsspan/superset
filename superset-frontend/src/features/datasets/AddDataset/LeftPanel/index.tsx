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
import { useEffect, SetStateAction, Dispatch, useCallback } from 'react';
import { t } from '@apache-superset/core/translation';
import { styled } from '@apache-superset/core/theme';
import { DatabaseSelector, TableExploreTree, type DatabaseObject } from 'src/components';
import { Empty, EmptyState, Typography } from '@superset-ui/core/components';
import WarningIconWithTooltip from '@superset-ui/core/components/WarningIconWithTooltip';
import { useToasts } from 'src/components/MessageToasts/withToasts';
import { LocalStorageKeys, getItem } from 'src/utils/localStorageHelpers';
import {
  DatasetActionType,
  DatasetObject,
} from 'src/features/datasets/AddDataset/types';
import { ensureAppRoot } from 'src/utils/navigationUtils';

interface LeftPanelProps {
  setDataset: Dispatch<SetStateAction<object>>;
  dataset?: Partial<DatasetObject> | null;
  datasetNames?: (string | null | undefined)[] | undefined;
}

const LeftPanelStyle = styled.div`
  ${({ theme }) => `
    padding: ${theme.sizeUnit * 4}px;
    height: 100%;
    background-color: ${theme.colorBgContainer};
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;

    .divider {
      border-bottom: 1px solid ${theme.colorSplit};
      margin: ${theme.sizeUnit * 3}px 0;
    }
  `}
`;

export default function LeftPanel({
  setDataset,
  dataset,
  datasetNames,
}: LeftPanelProps) {
  const { addDangerToast } = useToasts();

  const setDatabase = useCallback(
    (db: Partial<DatabaseObject>) => {
      setDataset({ type: DatasetActionType.SelectDatabase, payload: { db } });
    },
    [setDataset],
  );

  const setCatalog = useCallback(
    (catalog: string | null) => {
      if (catalog) {
        setDataset({
          type: DatasetActionType.SelectCatalog,
          payload: { name: 'catalog', value: catalog },
        });
      }
    },
    [setDataset],
  );

  const handleSelectTable = useCallback(
    ({ schema, tableName }: { schema: string; tableName: string }) => {
      setDataset({
        type: DatasetActionType.SelectTableAndSchema,
        payload: { schema, table_name: tableName },
      });
    },
    [setDataset],
  );

  useEffect(() => {
    const currentUserSelectedDb = getItem(
      LocalStorageKeys.Database,
      null,
    ) as DatabaseObject;
    if (currentUserSelectedDb) {
      setDatabase(currentUserSelectedDb);
    }
  }, [setDatabase]);

  const renderTableExtra = useCallback(
    ({ tableName }: { tableName: string }) => {
      if (datasetNames?.includes(tableName)) {
        return (
          <WarningIconWithTooltip
            warningMarkdown={t('This table already has a dataset')}
            size="l"
            marginRight={4}
          />
        );
      }
      return null;
    },
    [datasetNames],
  );

  const getDatabaseEmptyState = (emptyResultsWithSearch: boolean) => (
    <EmptyState
      image="empty.svg"
      title={
        emptyResultsWithSearch
          ? t('No databases match your search')
          : t('No databases available')
      }
      description={
        <span>
          {t('Manage your databases')}{' '}
          <Typography.Link href={ensureAppRoot('/databaseview/list')}>
            {t('here')}
          </Typography.Link>
        </span>
      }
      size="small"
    />
  );

  return (
    <LeftPanelStyle data-test="dataset-left-panel">
      <DatabaseSelector
        db={dataset?.db}
        emptyState={getDatabaseEmptyState(false)}
        handleError={addDangerToast}
        onDbChange={setDatabase}
        onCatalogChange={setCatalog}
        catalog={dataset?.catalog}
        showSchemaSelector={false}
      />
      <div className="divider" />
      {dataset?.db?.id ? (
        <TableExploreTree
          dbId={dataset?.db?.id}
          catalog={dataset?.catalog}
          selectedTable={{
            schema: dataset?.schema,
            tableName: dataset?.table_name,
          }}
          onSelectTable={handleSelectTable}
          renderTableExtra={renderTableExtra}
          showColumns={false}
          showToolbar
        />
      ) : (
        <Empty
          description={t('Select a database to view schemas and tables')}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      )}
    </LeftPanelStyle>
  );
}
