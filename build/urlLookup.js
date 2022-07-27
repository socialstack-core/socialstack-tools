function lookupCache(allPages){
	
	function lookupNode(){
		this.children = {};
		
		this.tryGetChild = function(name){
			return this.children[name];
		}
	}
	
	this.rootPage = new lookupNode();
	this.notFoundPage = null;
	this.pageUrlList = [];
	
	this.getPage = function(url) {
		url = url.split('?')[0].trim();
		if (url.length != 0 && url[0] == '/')
		{
			url = url.substring(1);
		}

		if (url.length != 0 && url[url.length - 1] == '/')
		{
			url = url.substring(0, url.length - 1);
		}
		
		var curNode = this.rootPage;

		if (curNode == null)
		{
			return null;
		}
		
		var wildcardTokens = null;

		if (url.length != 0)
		{
			var parts = url.split('/');
			
			for (var i = 0; i < parts.length; i++)
			{
				var nextNode = curNode.tryGetChild(parts[i]);
				
				if (!nextNode)
				{
					nextNode = curNode.wildcard;

					if (nextNode != null)
					{
						// Using a wildcard node. Add token value to set:
						if (wildcardTokens == null)
						{
							wildcardTokens = [];
						}

						wildcardTokens.push(parts[i]);
					}
				}

				if (nextNode == null)
				{
					// 404
					return null;
				}
				
				curNode = nextNode;
			}
			
		}

		return {
			page: curNode.page,
			tokens: curNode.urlTokens,
			tokenValues: wildcardTokens,
			tokenNames: curNode.tokenNames
		};
	};
	
	// Loop over pages and establish which scope it belongs to:
	for (var p = 0; p < allPages.length; p++)
	{
		var page = allPages[p];

		if (page == null)
		{
			continue;
		}

		var url = page.url;

		if (!url)
		{
			continue;
		}
		
		var tokenSet = [];

		if (url == "/404")
		{
			this.notFoundPage = page;
		}

		if (url.length != 0 && url[0] == '/')
		{
			url = url.substring(1);
		}

		if (url.length != 0 && url[url.length - 1] == '/')
		{
			url = url.substring(0, url.length - 1);
		}

		// URL parts:

		var pg = this.rootPage;

		if (url.length != 0)
		{
			var parts = url.split('/');
			var skip = false;

			for (var i = 0; i < parts.length; i++)
			{
				var part = parts[i];
				var token = null;

				if (part.length != 0)
				{
					if (part[0] == ':')
					{
						token = part.substring(1);
						tokenSet.push({
							rawToken: token
						});
					}
					else if (part[0] == '{')
					{
						token = (part[part.length - 1] == '}') ? part.substring(1, part.length - 1) : part.substring(1);

						var dotIndex = token.indexOf('.');

						if (dotIndex != -1)
						{
							var contentType = token.substring(0, dotIndex);
							var fieldName = token.substring(dotIndex + 1);
							
							tokenSet.push(
							{
								rawToken: token,
								typeName: contentType,
								fieldName: fieldName,
								isId: fieldName.toLowerCase() == "id"
							});
						}
						else
						{
							tokenSet.push(
							{
								rawToken: token
							});
						}
						
					}
				}
				
				if (token != null)
				{
					// Anything. Treat these tokens as *:
					part = "*";
				}
				
				var next = pg.tryGetChild(part);
				
				if (!next)
				{
					pg.children[part] = next = new lookupNode();
					
					if (token != null)
					{
						// It's the wildcard one:
						pg.wildcard = next;
					}
				}

				pg = next;
			}

			if (skip)
			{
				continue;
			}
		}
		
		pg.page = page;
		pg.urlTokens = tokenSet;
		pg.tokenNames = tokenSet.map(token => token.rawToken);
	}
}

var pageCache = new lookupCache(pages);

function onRoutePage(url, webRequest){
	var pg = pageCache.getPage(url);
	if(!pg){
		return {page:pageCache.notFoundPage};
	}
	
	// Does it have a primary object?
	if(pg.tokens){
		var hasPo = false;
		
		for(var i=0;i<pg.tokens.length;i++){
			var token = pg.tokens[i];
			
			if(token.typeName){
				hasPo = token.typeName + '/' + pg.tokenValues[i];
				break;
			}
		}
		
		if(hasPo){
			pg.loading = webRequest(hasPo).then(resp => {
				pg.po = resp.json;
				return {
					...pg,
					tokens: pg.tokenValues
				};
			});
		}
	}
	
	return {
		...pg,
		tokens: pg.tokenValues
	};
}