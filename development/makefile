
up-linked:
	#mkdir -p ./data-linked
	docker-compose -f docker-compose-linked.yml up

up-clean: clean
	mkdir -p ./data-clean
	#cp ../example/flows.json data-clean/
	#(cd data-clean && npm i node-red-dashboard)
	docker-compose -f docker-compose-clean.yml up

jtdx:
	xhost +"local:docker@"
	docker run -it --rm \
		--name jtdx \
		--device /dev/snd:/dev/snd \
		--device /dev/dri \
		-e DISPLAY=unix:0 \
		-e PULSE_SERVER=unix:${XDG_RUNTIME_DIR}/pulse/native \
		-v ${XDG_RUNTIME_DIR}/pulse/native:${XDG_RUNTIME_DIR}/pulse/native \
		-v ~/.config/pulse/cookie:/root/.config/pulse/cookie \
		-v ~/.local/share/JTDX:/root/.local/share/JTDX \
		-v ~/.config:/root/.config \
		-v /dev/shm:/dev/shm \
		-v /tmp/.X11-unix:/tmp/.X11-unix \
		-v /run/dbus/:/run/dbus/ \
		-v /dev/shm:/dev/shm \
		--group-add 29 \
		hakankoseoglu/jtdx:latest

#		--group-add $(getent group audio | cut -d: -f3)
wsjtx:
	xhost +"local:docker@"
	docker run -it --rm \
		--name jtdx \
		--device /dev/snd:/dev/snd \
		--device /dev/dri \
		-e DISPLAY=unix:0 \
		-e PULSE_SERVER=unix:${XDG_RUNTIME_DIR}/pulse/native \
		-v ${XDG_RUNTIME_DIR}/pulse/native:${XDG_RUNTIME_DIR}/pulse/native \
		-v ~/.config/pulse/cookie:/root/.config/pulse/cookie \
		-v ~/.local/share/WSJT-X:/root/.local/share/WSJT-X \
		-v ~/.config:/root/.config \
		-v /dev/shm:/dev/shm \
		-v /tmp/.X11-unix:/tmp/.X11-unix \
		-v /run/dbus/:/run/dbus/ \
		-v /dev/shm:/dev/shm \
		--group-add 29 \
		hakankoseoglu/wsjtx:latest

clean:
	rm -rf ./data
