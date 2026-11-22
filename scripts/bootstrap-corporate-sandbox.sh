#!/usr/bin/env bash
# NIXINX — sandbox provisioning, only from the intended NIXINX Cloud Shell.
# Default: read-only preflight. --apply explicitly creates TWO NEW projects.
# Does not attach billing accounts, assign IAM, or modify existing projects.
set -Eeuo pipefail

MODE="${1:---preflight}"
if [[ "$MODE" != "--preflight" && "$MODE" != "--apply" ]]; then
  echo "Usage: CONTROL_PROJECT=... CORPORATE_PROJECT=... bash scripts/bootstrap-corporate-sandbox.sh [--preflight|--apply]" >&2
  exit 2
fi

ORG="284170795039"
CORP_FOLDER="430151461778"
TEST_FOLDER="410789317555"
LOCATION="northamerica-northeast2"
CONTROL_PROJECT="${CONTROL_PROJECT:-nixinx-control-sbx-26}"
CORPORATE_PROJECT="${CORPORATE_PROJECT:-nixinx-corporate-sbx-26}"

fail(){ echo "STOP: $*" >&2; exit 1; }
for c in gcloud firebase; do command -v "$c" >/dev/null 2>&1 || fail "$c no disponible en este Shell"; done

ACCOUNT="$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n1)"
[[ "$ACCOUNT" == "admin@nixinx.com" || "$ACCOUNT" == "superadmin@nixinx.com" ]] || fail "Cuenta activa distinta de administración NIXINX: ${ACCOUNT:-ninguna}"
echo "PASS Cuenta: $ACCOUNT"

FOLDER_PARENT="$(gcloud resource-manager folders describe "$TEST_FOLDER" --format='value(parent)')" ||
  fail "No se puede verificar carpeta Development and Testing"
[[ "$FOLDER_PARENT" == "folders/$CORP_FOLDER" ]] || fail "Carpeta de pruebas no pertenece a NIXINX Corporation"
CORP_PARENT="$(gcloud resource-manager folders describe "$CORP_FOLDER" --format='value(parent)')" ||
  fail "No se puede verificar carpeta NIXINX Corporation"
[[ "$CORP_PARENT" == "organizations/$ORG" ]] || fail "La carpeta Corporation no pertenece a la organización aprobada"
echo "PASS NIXINX org $ORG / Corporate $CORP_FOLDER / Development and Testing $TEST_FOLDER"

[[ "$CONTROL_PROJECT" != "$CORPORATE_PROJECT" ]] || fail "Los dos IDs deben ser distintos"
for p in "$CONTROL_PROJECT" "$CORPORATE_PROJECT"; do
  [[ "$p" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ && "$p" == *-sbx-* ]] ||
    fail "ID inválido o no identificado como sandbox: $p"
  case "$p" in
    nixinx-control|nelcy-corporate-group|htl-data-warehouse|htw-data-warehouse|athelier-ventures)
      fail "Proyecto de producción protegido: $p";;
  esac
  if gcloud projects describe "$p" --format='value(projectId)' >/dev/null 2>&1; then
    fail "El proyecto $p ya existe o es accesible; no modificar ni adoptar proyectos previos"
  fi
done
echo "PASS: IDs propuestos sin acceso a un proyecto existente (la creación también fallará si el ID está ocupado)"
echo "CONTROL_SANDBOX_PROJECT=$CONTROL_PROJECT"
echo "CORPORATE_SANDBOX_PROJECT=$CORPORATE_PROJECT"
echo "Ubicación Firestore deseada: $LOCATION"
echo "Billing: NO se vinculará automáticamente"
if [[ "$MODE" == "--preflight" ]]; then
 echo "PRECHECK PASS. Ningún recurso fue creado. Para crear: ... --apply"
 exit 0
fi

echo "Se crearán DOS PROYECTOS NUEVOS dentro de NIXINX / Development and Testing."
read -r -p "Escribe CREATE TWO SANDBOX PROJECTS para continuar: " confirmation
[[ "$confirmation" == "CREATE TWO SANDBOX PROJECTS" ]] || fail "Operación cancelada"
for spec in "$CONTROL_PROJECT|NIXINX Control Sandbox" "$CORPORATE_PROJECT|NIXINX Corporate Sandbox"; do
  p="${spec%%|*}"
  display="${spec#*|}"
  echo "=== CREATE PROJECT: $p ==="
  gcloud projects create "$p" --folder="$TEST_FOLDER" --name="$display" ||
    fail "No se pudo crear $p (si el ID está ocupado, elige otro con sufijo -sbx-)"
  echo "=== ADD FIREBASE: $p ==="
  firebase projects:addfirebase --project="$p" || fail "Proyecto creado, pero Firebase pendiente para $p; no reintentar creación completa"
  echo "=== CREATE DEFAULT FIRESTORE: $p ==="
  gcloud firestore databases create --database='(default)' --location="$LOCATION" --type=firestore-native --project="$p" ||
    fail "Proyecto/Firebase creados, pero Firestore pendiente para $p; revisar permisos/billing sin reutilizar producción"
  echo "=== REGISTER WEB APP: $p ==="
  firebase apps:create web "$display Web" --project="$p" ||
    fail "Proyecto/Firebase/Firestore creados; web app pendiente para $p"
  echo "PASS Creación sandbox $p"
done

echo "CREACIÓN COMPLETADA: proyectos de sandbox independientes bajo NIXINX"
echo "Pendiente: habilitar Google Authentication, registrar dominios de Preview, probar reglas en Emulator, configurar env Vercel por rama y documentar IDs reales en FDV."
echo "No se modificaron projects, Firestore, IAM ni billing de Nelcy/HTL/HTW."
