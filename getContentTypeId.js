const _hash1 = ((5381 << 16) + 5381)|0;

const floor = Math.floor;

/*
	Converts a typeName like "BlogPost" to its numeric content type ID.
	If porting this, instead take a look at the C# version in ContentTypes.cs. 
	Most of the stuff here is for forcing JS to do integer arithmetic.
*/
export default function(typeName) {
	typeName = typeName.toLowerCase();
	var hash1 = _hash1;
	var hash2 = hash1;
	
	for (var i = 0; i < typeName.length; i += 2)
	{
		var s1 = ~~floor(hash1 << 5);
		hash1 = ~~floor(s1 + hash1);
		hash1 = hash1 ^ typeName.charCodeAt(i);
		if (i == typeName.length - 1)
			break;
		
		s1 = ~~floor(hash2 << 5);
		hash2 = ~~floor(s1 + hash2);
		hash2 = hash2 ^ typeName.charCodeAt(i+1);
	}
	
	var result = ~~floor(Math.imul(hash2, 1566083941));
	result = ~~floor(hash1 + result);
	return result;
};