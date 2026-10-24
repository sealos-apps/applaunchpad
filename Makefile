DOCKER_USERNAME ?=
IMAGE_TAG ?= dev
PLATFORMS ?= linux/amd64,linux/arm64
IMAGE_ARCHIVE ?= applaunchpad.tar

ifneq ($(strip $(DOCKER_USERNAME)),)
  imageOwner := $(DOCKER_USERNAME)/
else
  imageOwner :=
endif
IMAGE ?= $(imageOwner)sealos-applaunchpad:$(IMAGE_TAG)

.PHONY: all push-images fetch-deps build-packages build-applaunchpad dev-applaunchpad image-build-applaunchpad image-push-applaunchpad

all: image-build-applaunchpad
push-images: image-push-applaunchpad

fetch-deps: pnpm-lock.yaml
	pnpm fetch

build-packages: fetch-deps
	pnpm -r --offline --filter='./packages/*' install
	pnpm -r --filter='./packages/*' run build

build-applaunchpad: build-packages
	pnpm --offline --filter=applaunchpad install
	pnpm --filter=applaunchpad run build

dev-applaunchpad: build-packages
	pnpm --offline --filter=applaunchpad install
	pnpm --filter=applaunchpad run dev

image-build-applaunchpad:
	docker buildx build --platform=$(PLATFORMS) -t $(IMAGE) --output=type=oci,dest=$(IMAGE_ARCHIVE) .

image-push-applaunchpad:
	docker buildx build --platform=$(PLATFORMS) -t $(IMAGE) --push .
