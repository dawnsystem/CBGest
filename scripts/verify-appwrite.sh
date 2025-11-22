#!/bin/bash

# Script de verificación de Appwrite para CBGest
# Uso: export APPWRITE_API_KEY="tu-api-key" && ./scripts/verify-appwrite.sh

CONFIG_ENDPOINT="https://fra.cloud.appwrite.io/v1"
CONFIG_PROJECT="cbgest"
CONFIG_DATABASE="691f288100019843d43e"
CONFIG_BUCKET="691f31c9000fc8c83ab1"

COLLECTIONS=("invoices" "entries" "transactions" "settings" "suppliers" "notifications" "uploads")

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

if [ -z "$APPWRITE_API_KEY" ]; then
    echo -e "${RED}Error: APPWRITE_API_KEY environment variable is required${NC}"
    echo "Usage: export APPWRITE_API_KEY='your-api-key' && $0"
    exit 1
fi

echo "=============================================="
echo "CBGest - Appwrite Setup Verification"
echo "=============================================="
echo "Endpoint: $CONFIG_ENDPOINT"
echo "Project:  $CONFIG_PROJECT"
echo "Database: $CONFIG_DATABASE"
echo "Bucket:   $CONFIG_BUCKET"
echo ""

TOTAL=0
PASSED=0

check() {
    TOTAL=$((TOTAL + 1))
    if [ "$1" = "true" ]; then
        PASSED=$((PASSED + 1))
        echo -e "  ${GREEN}✓${NC} $2"
    else
        echo -e "  ${RED}✗${NC} $2"
    fi
}

warn() {
    echo -e "  ${YELLOW}⚠${NC} $1"
}

# Función para hacer request a Appwrite
appwrite_request() {
    local path="$1"
    curl -s -w "\n%{http_code}" -X GET "${CONFIG_ENDPOINT}${path}" \
        -H "Content-Type: application/json" \
        -H "X-Appwrite-Project: $CONFIG_PROJECT" \
        -H "X-Appwrite-Key: $APPWRITE_API_KEY" 2>/dev/null
}

# 1. Verificar Database
echo "📊 Verificando Database..."
RESPONSE=$(appwrite_request "/databases/${CONFIG_DATABASE}")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    DB_NAME=$(echo "$BODY" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
    check "true" "Database '$DB_NAME' existe"
elif [ "$HTTP_CODE" = "404" ]; then
    check "false" "Database no encontrada (404)"
    echo ""
    echo -e "${RED}No se puede continuar sin base de datos${NC}"
    exit 1
else
    check "false" "Error accediendo database (HTTP $HTTP_CODE)"
    if echo "$BODY" | grep -q "Access denied"; then
        echo ""
        echo -e "${YELLOW}Posibles causas del 'Access denied':${NC}"
        echo "  1. La API key no es válida o ha expirado"
        echo "  2. La API key no tiene los scopes necesarios"
        echo "     (necesita: databases.read, collections.read)"
        echo "  3. El proyecto ID es incorrecto"
        echo ""
        echo "Verifica tu API key en la consola de Appwrite:"
        echo "  https://cloud.appwrite.io/console/project-cbgest/settings/api-keys"
    fi
    exit 1
fi

# 2. Verificar Storage Bucket
echo ""
echo "🗄️  Verificando Storage Bucket..."
RESPONSE=$(appwrite_request "/storage/buckets/${CONFIG_BUCKET}")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    BUCKET_NAME=$(echo "$BODY" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
    check "true" "Storage bucket '$BUCKET_NAME' existe"
elif [ "$HTTP_CODE" = "404" ]; then
    check "false" "Storage bucket no encontrado (404)"
else
    check "false" "Error accediendo bucket (HTTP $HTTP_CODE)"
fi

# 3. Verificar Colecciones
echo ""
echo "📦 Verificando Colecciones..."

for COLL_ID in "${COLLECTIONS[@]}"; do
    RESPONSE=$(appwrite_request "/databases/${CONFIG_DATABASE}/collections/${COLL_ID}")
    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" = "200" ]; then
        COLL_NAME=$(echo "$BODY" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
        check "true" "$COLL_ID ($COLL_NAME)"

        # Verificar atributos
        ATTR_RESPONSE=$(appwrite_request "/databases/${CONFIG_DATABASE}/collections/${COLL_ID}/attributes")
        ATTR_HTTP=$(echo "$ATTR_RESPONSE" | tail -1)
        ATTR_BODY=$(echo "$ATTR_RESPONSE" | sed '$d')

        if [ "$ATTR_HTTP" = "200" ]; then
            ATTR_COUNT=$(echo "$ATTR_BODY" | grep -o '"total":' | wc -l)
            # Contar atributos (aproximado por la cantidad de "key": en el response)
            ATTRS=$(echo "$ATTR_BODY" | grep -o '"key":"[^"]*"' | wc -l)
            echo "       Atributos: $ATTRS"

            # Verificar si hay atributos en estado processing
            if echo "$ATTR_BODY" | grep -q '"status":"processing"'; then
                warn "Algunos atributos aún procesando"
            fi
        fi

        # Verificar índices
        IDX_RESPONSE=$(appwrite_request "/databases/${CONFIG_DATABASE}/collections/${COLL_ID}/indexes")
        IDX_HTTP=$(echo "$IDX_RESPONSE" | tail -1)
        IDX_BODY=$(echo "$IDX_RESPONSE" | sed '$d')

        if [ "$IDX_HTTP" = "200" ]; then
            IDXS=$(echo "$IDX_BODY" | grep -o '"key":"[^"]*"' | wc -l)
            echo "       Índices: $IDXS"

            if echo "$IDX_BODY" | grep -q '"status":"failed"'; then
                warn "Algunos índices fallidos"
            fi
            if echo "$IDX_BODY" | grep -q '"status":"processing"'; then
                warn "Algunos índices procesando"
            fi
        fi
    elif [ "$HTTP_CODE" = "404" ]; then
        check "false" "$COLL_ID (NO EXISTE)"
    else
        check "false" "$COLL_ID (Error HTTP $HTTP_CODE)"
    fi
done

# Resumen
echo ""
echo "=============================================="
echo "RESUMEN"
echo "=============================================="
ISSUES=$((TOTAL - PASSED))
echo "Total verificaciones: $TOTAL"
echo "Pasadas: $PASSED"
echo "Problemas: $ISSUES"
echo ""

if [ "$ISSUES" -eq 0 ]; then
    echo -e "${GREEN}🎉 Todo está correctamente configurado en Appwrite${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️  Se encontraron $ISSUES problema(s)${NC}"
    echo "   Ejecuta: node scripts/setup-all-collections.cjs"
    exit 1
fi
