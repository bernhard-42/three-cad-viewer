function load(assembly) {

    function convertAssembly(assembly) {
        const delim = "/";
        var states = {};

        function _convertAssembly(subAssembly, path) {
            const newPath = `${path}${delim}${subAssembly.name}`;
            var result = {
                name: subAssembly.name,
                id: newPath
            };
            if (subAssembly.parts) {
                result.parts = [];
                result.loc = subAssembly.loc;
                for (var part of subAssembly.parts) {
                    result.parts.push(_convertAssembly(part, newPath));
                }
            } else {
                result.type = subAssembly.type;
                if (subAssembly.shape.edges) {
                    subAssembly.shape.edges = subAssembly.shape.edges[0];
                }
                result.shape = subAssembly.shape;
                result.color = subAssembly.color;
                if (subAssembly.type == "edges") {
                    result.width = 3;
                    states[newPath] = [3, 1];
                } else if (subAssembly.type == "vertices") {
                    result.size = 6;
                    states[newPath] = [3, 1];
                } else {
                    states[newPath] = [1, 1];
                }
            }
            return result;
        }
        return [_convertAssembly(assembly, ""), states];
    }
    return convertAssembly(assembly.shapes)
}